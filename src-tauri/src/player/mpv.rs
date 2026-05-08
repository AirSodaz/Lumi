use std::{
    collections::HashMap,
    env,
    ffi::{CStr, CString},
    os::raw::{c_char, c_double, c_int, c_void},
    path::PathBuf,
    ptr,
    sync::{Arc, Mutex},
};

use libloading::Library;

use super::{
    playback_command_failed, playback_init_failed, playback_library_missing, MpvBackend,
    MpvOpenRequest, PlaybackCommand,
};
use crate::errors::AppResult;

type MpvCreate = unsafe extern "C" fn() -> *mut c_void;
type MpvInitialize = unsafe extern "C" fn(*mut c_void) -> c_int;
type MpvSetOptionString = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type MpvCommand = unsafe extern "C" fn(*mut c_void, *const *const c_char) -> c_int;
type MpvGetProperty = unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut c_void) -> c_int;
type MpvTerminateDestroy = unsafe extern "C" fn(*mut c_void);
type MpvErrorString = unsafe extern "C" fn(c_int) -> *const c_char;

const MPV_FORMAT_DOUBLE: c_int = 5;

pub struct RuntimeMpvBackend {
    resource_dir: Option<PathBuf>,
    library: Mutex<Option<Arc<MpvLibrary>>>,
    instances: Mutex<HashMap<String, RuntimeMpvInstance>>,
}

impl Default for RuntimeMpvBackend {
    fn default() -> Self {
        Self::new(None)
    }
}

impl RuntimeMpvBackend {
    pub fn new(resource_dir: Option<PathBuf>) -> Self {
        Self {
            resource_dir,
            library: Mutex::new(None),
            instances: Mutex::new(HashMap::new()),
        }
    }
}

impl MpvBackend for RuntimeMpvBackend {
    fn open(&self, request: MpvOpenRequest) -> AppResult<()> {
        let library = self.library()?;
        let handle = library.create_handle(request.window_id)?;
        library.command(handle, &["loadfile", &request.media_url, "replace"])?;
        self.instances
            .lock()
            .map_err(|_| crate::errors::AppError::state_lock_poisoned("mpv_instances"))?
            .insert(request.session_id, RuntimeMpvInstance { handle, library });
        Ok(())
    }

    fn command(&self, session_id: &str, command: PlaybackCommand) -> AppResult<()> {
        let mut instances = self
            .instances
            .lock()
            .map_err(|_| crate::errors::AppError::state_lock_poisoned("mpv_instances"))?;
        let instance = instances
            .get_mut(session_id)
            .ok_or_else(|| playback_command_failed(format!("missing mpv instance {session_id}")))?;

        match command {
            PlaybackCommand::Play => {
                instance
                    .library
                    .command(instance.handle, &["set", "pause", "no"])?;
            }
            PlaybackCommand::Pause => {
                instance
                    .library
                    .command(instance.handle, &["set", "pause", "yes"])?;
            }
            PlaybackCommand::Seek { position_seconds } => {
                instance.library.command(
                    instance.handle,
                    &["seek", &position_seconds.to_string(), "absolute"],
                )?;
            }
            PlaybackCommand::SetVolume { volume } => {
                instance
                    .library
                    .command(instance.handle, &["set", "volume", &volume.to_string()])?;
            }
            PlaybackCommand::Close => {
                drop(instances);
                self.close(session_id)?;
            }
        }

        Ok(())
    }

    fn close(&self, session_id: &str) -> AppResult<()> {
        let instance = self
            .instances
            .lock()
            .map_err(|_| crate::errors::AppError::state_lock_poisoned("mpv_instances"))?
            .remove(session_id);

        if let Some(instance) = instance {
            let _ = instance.library.command(instance.handle, &["quit"]);
            instance.library.destroy(instance.handle);
        }

        Ok(())
    }

    fn position_seconds(&self, session_id: &str) -> AppResult<Option<u32>> {
        let instances = self
            .instances
            .lock()
            .map_err(|_| crate::errors::AppError::state_lock_poisoned("mpv_instances"))?;
        let Some(instance) = instances.get(session_id) else {
            return Ok(None);
        };
        instance.library.position_seconds(instance.handle)
    }
}

impl RuntimeMpvBackend {
    fn library(&self) -> AppResult<Arc<MpvLibrary>> {
        if let Some(library) = self
            .library
            .lock()
            .map_err(|_| crate::errors::AppError::state_lock_poisoned("mpv_library"))?
            .clone()
        {
            return Ok(library);
        }

        let library = Arc::new(MpvLibrary::load(self.resource_dir.as_deref())?);
        *self
            .library
            .lock()
            .map_err(|_| crate::errors::AppError::state_lock_poisoned("mpv_library"))? =
            Some(library.clone());
        Ok(library)
    }
}

struct RuntimeMpvInstance {
    handle: *mut c_void,
    library: Arc<MpvLibrary>,
}

unsafe impl Send for RuntimeMpvInstance {}

struct MpvLibrary {
    _library: Library,
    create: MpvCreate,
    initialize: MpvInitialize,
    set_option_string: MpvSetOptionString,
    command: MpvCommand,
    get_property: MpvGetProperty,
    terminate_destroy: MpvTerminateDestroy,
    error_string: MpvErrorString,
}

unsafe impl Send for MpvLibrary {}
unsafe impl Sync for MpvLibrary {}

impl MpvLibrary {
    fn load(resource_dir: Option<&std::path::Path>) -> AppResult<Self> {
        let candidates = library_candidates(resource_dir);
        Self::load_from_candidates(candidates)
    }

    fn load_from_candidates(candidates: Vec<String>) -> AppResult<Self> {
        let mut last_error = String::from("no candidate paths");

        for candidate in &candidates {
            let library = load_library_candidate(candidate);
            match library {
                Ok(library) => return Self::from_library(library, candidates.clone()),
                Err(error) => last_error = error.to_string(),
            }
        }

        Err(playback_library_missing(candidates, last_error))
    }

    fn from_library(library: Library, candidates: Vec<String>) -> AppResult<Self> {
        unsafe {
            let create = *library
                .get::<MpvCreate>(b"mpv_create\0")
                .map_err(|error| playback_library_missing(candidates.clone(), error))?;
            let initialize = *library
                .get::<MpvInitialize>(b"mpv_initialize\0")
                .map_err(|error| playback_library_missing(candidates.clone(), error))?;
            let set_option_string = *library
                .get::<MpvSetOptionString>(b"mpv_set_option_string\0")
                .map_err(|error| playback_library_missing(candidates.clone(), error))?;
            let command = *library
                .get::<MpvCommand>(b"mpv_command\0")
                .map_err(|error| playback_library_missing(candidates.clone(), error))?;
            let get_property = *library
                .get::<MpvGetProperty>(b"mpv_get_property\0")
                .map_err(|error| playback_library_missing(candidates.clone(), error))?;
            let terminate_destroy = *library
                .get::<MpvTerminateDestroy>(b"mpv_terminate_destroy\0")
                .map_err(|error| playback_library_missing(candidates.clone(), error))?;
            let error_string = *library
                .get::<MpvErrorString>(b"mpv_error_string\0")
                .map_err(|error| playback_library_missing(candidates, error))?;

            Ok(Self {
                _library: library,
                create,
                initialize,
                set_option_string,
                command,
                get_property,
                terminate_destroy,
                error_string,
            })
        }
    }

    fn create_handle(&self, window_id: i64) -> AppResult<*mut c_void> {
        let handle = unsafe { (self.create)() };
        if handle.is_null() {
            return Err(playback_init_failed("mpv_create returned null"));
        }

        self.set_option(handle, "wid", &window_id.to_string())?;
        self.set_option(handle, "keep-open", "no")?;
        self.set_option(handle, "force-window", "yes")?;

        let result = unsafe { (self.initialize)(handle) };
        if result < 0 {
            let message = self.error_message(result);
            unsafe { (self.terminate_destroy)(handle) };
            return Err(playback_init_failed(message));
        }

        Ok(handle)
    }

    fn set_option(&self, handle: *mut c_void, name: &str, value: &str) -> AppResult<()> {
        let name = CString::new(name).map_err(playback_init_failed)?;
        let value = CString::new(value).map_err(playback_init_failed)?;
        let result = unsafe { (self.set_option_string)(handle, name.as_ptr(), value.as_ptr()) };
        if result < 0 {
            return Err(playback_init_failed(self.error_message(result)));
        }
        Ok(())
    }

    fn command(&self, handle: *mut c_void, args: &[&str]) -> AppResult<()> {
        let c_args = args
            .iter()
            .map(|arg| CString::new(*arg).map_err(playback_command_failed))
            .collect::<AppResult<Vec<_>>>()?;
        let mut raw_args = c_args
            .iter()
            .map(|arg| arg.as_ptr())
            .collect::<Vec<*const c_char>>();
        raw_args.push(ptr::null());

        let result = unsafe { (self.command)(handle, raw_args.as_ptr()) };
        if result < 0 {
            return Err(playback_command_failed(self.error_message(result)));
        }
        Ok(())
    }

    fn position_seconds(&self, handle: *mut c_void) -> AppResult<Option<u32>> {
        let name = CString::new("time-pos").map_err(playback_command_failed)?;
        let mut value = 0.0_f64;
        let result = unsafe {
            (self.get_property)(
                handle,
                name.as_ptr(),
                MPV_FORMAT_DOUBLE,
                (&mut value as *mut c_double).cast::<c_void>(),
            )
        };
        if result < 0 {
            return Ok(None);
        }
        Ok(Some(value.max(0.0).min(u32::MAX as f64) as u32))
    }

    fn destroy(&self, handle: *mut c_void) {
        unsafe { (self.terminate_destroy)(handle) };
    }

    fn error_message(&self, code: c_int) -> String {
        let message = unsafe { (self.error_string)(code) };
        if message.is_null() {
            return format!("mpv error {code}");
        }
        unsafe { CStr::from_ptr(message) }
            .to_string_lossy()
            .into_owned()
    }
}

#[cfg(target_os = "windows")]
fn load_library_candidate(candidate: &str) -> Result<Library, libloading::Error> {
    use libloading::os::windows::{Library as WindowsLibrary, LOAD_WITH_ALTERED_SEARCH_PATH};

    let path = std::path::Path::new(candidate);
    if path.is_absolute() {
        unsafe {
            WindowsLibrary::load_with_flags(candidate, LOAD_WITH_ALTERED_SEARCH_PATH)
                .map(Into::into)
        }
    } else {
        unsafe { Library::new(candidate) }
    }
}

#[cfg(not(target_os = "windows"))]
fn load_library_candidate(candidate: &str) -> Result<Library, libloading::Error> {
    unsafe { Library::new(candidate) }
}

fn library_candidates(resource_dir: Option<&std::path::Path>) -> Vec<String> {
    library_candidates_for(
        env::var("LUMI_LIBMPV_PATH").ok().as_deref(),
        current_exe_dir().as_deref(),
        resource_dir,
        env::consts::OS,
        env::consts::ARCH,
    )
}

fn library_candidates_for(
    env_path: Option<&str>,
    app_dir: Option<&std::path::Path>,
    resource_dir: Option<&std::path::Path>,
    os: &str,
    arch: &str,
) -> Vec<String> {
    let mut candidates = Vec::new();
    if let Some(path) = env_path {
        if !path.trim().is_empty() {
            candidates.push(path.to_string());
        }
    }

    candidates.extend(default_library_names_for(os).into_iter().map(String::from));
    candidates.extend(app_local_library_paths(app_dir, os));
    candidates.extend(bundled_library_paths(resource_dir, os, arch));
    candidates.extend(development_resource_library_paths(app_dir, os, arch));
    candidates
}

fn default_library_names_for(os: &str) -> Vec<&'static str> {
    match os {
        "windows" => vec!["mpv-2.dll", "libmpv-2.dll", "libmpv.dll"],
        "macos" => vec!["libmpv.2.dylib", "libmpv.dylib"],
        _ => vec!["libmpv.so.2", "libmpv.so"],
    }
}

fn current_exe_dir() -> Option<PathBuf> {
    let Ok(exe) = env::current_exe() else {
        return None;
    };
    exe.parent().map(PathBuf::from)
}

fn app_local_library_paths(app_dir: Option<&std::path::Path>, os: &str) -> Vec<String> {
    let Some(dir) = app_dir else {
        return Vec::new();
    };
    default_library_names_for(os)
        .into_iter()
        .map(|name| dir.join(name).to_string_lossy().into_owned())
        .collect()
}

fn bundled_library_paths(
    resource_dir: Option<&std::path::Path>,
    os: &str,
    arch: &str,
) -> Vec<String> {
    let Some(resource_dir) = resource_dir else {
        return Vec::new();
    };
    let Some(platform_dir) = platform_resource_subdir_for(os, arch) else {
        return Vec::new();
    };

    default_library_names_for(os)
        .into_iter()
        .map(|name| {
            resource_dir
                .join("libmpv")
                .join(platform_dir)
                .join(name)
                .to_string_lossy()
                .into_owned()
        })
        .collect()
}

fn development_resource_library_paths(
    app_dir: Option<&std::path::Path>,
    os: &str,
    arch: &str,
) -> Vec<String> {
    let Some(app_dir) = app_dir else {
        return Vec::new();
    };
    let Some(profile_dir) = app_dir.file_name().and_then(|name| name.to_str()) else {
        return Vec::new();
    };
    if !matches!(profile_dir, "debug" | "release") {
        return Vec::new();
    }

    let Some(target_dir) = app_dir.parent() else {
        return Vec::new();
    };
    if target_dir.file_name().and_then(|name| name.to_str()) != Some("target") {
        return Vec::new();
    }

    let Some(crate_dir) = target_dir.parent() else {
        return Vec::new();
    };
    let Some(platform_dir) = platform_resource_subdir_for(os, arch) else {
        return Vec::new();
    };

    default_library_names_for(os)
        .into_iter()
        .map(|name| {
            crate_dir
                .join("resources")
                .join("libmpv")
                .join(platform_dir)
                .join(name)
                .to_string_lossy()
                .into_owned()
        })
        .collect()
}

fn platform_resource_subdir_for(os: &str, arch: &str) -> Option<&'static str> {
    match (os, arch) {
        ("windows", "x86_64") => Some("windows-x64"),
        ("windows", "aarch64") => Some("windows-arm64"),
        ("macos", "x86_64") => Some("macos-x64"),
        ("macos", "aarch64") => Some("macos-arm64"),
        ("linux", "x86_64") => Some("linux-x64"),
        ("linux", "aarch64") => Some("linux-arm64"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{library_candidates_for, platform_resource_subdir_for, MpvLibrary};

    #[test]
    fn missing_runtime_library_maps_to_stable_error_code() {
        let error =
            match MpvLibrary::load_from_candidates(
                vec!["Z:\\lumi-missing-libmpv\\mpv-2.dll".into()],
            ) {
                Ok(_) => panic!("missing libmpv should be recoverable"),
                Err(error) => error,
            };

        assert_eq!(error.code(), "playback.mpv_library_missing");
        assert!(error.recoverable());
    }

    #[test]
    fn bundled_candidates_are_checked_after_env_system_and_app_local_paths() {
        let app_dir = Path::new("C:/Program Files/Lumi");
        let resource_dir = Path::new("C:/Program Files/Lumi/resources");
        let candidates = library_candidates_for(
            Some("D:/mpv/custom/mpv-2.dll"),
            Some(app_dir),
            Some(resource_dir),
            "windows",
            "x86_64",
        );

        assert_eq!(candidates[0], "D:/mpv/custom/mpv-2.dll");
        assert_eq!(
            &candidates[1..4],
            ["mpv-2.dll", "libmpv-2.dll", "libmpv.dll"]
        );

        let app_local_index = candidates
            .iter()
            .map(|candidate| candidate.replace('\\', "/"))
            .position(|candidate| candidate.ends_with("Lumi/mpv-2.dll"))
            .expect("app-local mpv candidate");
        let bundled_index = candidates
            .iter()
            .map(|candidate| candidate.replace('\\', "/"))
            .position(|candidate| candidate.ends_with("resources/libmpv/windows-x64/mpv-2.dll"))
            .expect("bundled mpv candidate");

        assert!(bundled_index > app_local_index);
    }

    #[test]
    fn dev_candidates_include_staged_source_resources_after_bundled_resources() {
        let app_dir = Path::new("C:/repo/Lumi/src-tauri/target/debug");
        let resource_dir = Path::new("C:/repo/Lumi/src-tauri/target/debug");
        let candidates =
            library_candidates_for(None, Some(app_dir), Some(resource_dir), "windows", "x86_64");

        let normalized = candidates
            .iter()
            .map(|candidate| candidate.replace('\\', "/"))
            .collect::<Vec<_>>();
        let bundled_index = normalized
            .iter()
            .position(|candidate| {
                candidate.ends_with("src-tauri/target/debug/libmpv/windows-x64/libmpv-2.dll")
            })
            .expect("bundled target resource candidate");
        let dev_index = normalized
            .iter()
            .position(|candidate| {
                candidate.ends_with("src-tauri/resources/libmpv/windows-x64/libmpv-2.dll")
            })
            .expect("staged source resource candidate");

        assert!(dev_index > bundled_index);
    }

    #[test]
    fn platform_resource_subdir_maps_supported_release_targets() {
        assert_eq!(
            platform_resource_subdir_for("windows", "x86_64"),
            Some("windows-x64")
        );
        assert_eq!(
            platform_resource_subdir_for("windows", "aarch64"),
            Some("windows-arm64")
        );
        assert_eq!(
            platform_resource_subdir_for("macos", "x86_64"),
            Some("macos-x64")
        );
        assert_eq!(
            platform_resource_subdir_for("macos", "aarch64"),
            Some("macos-arm64")
        );
        assert_eq!(
            platform_resource_subdir_for("linux", "x86_64"),
            Some("linux-x64")
        );
        assert_eq!(
            platform_resource_subdir_for("linux", "aarch64"),
            Some("linux-arm64")
        );
        assert_eq!(platform_resource_subdir_for("linux", "arm"), None);
    }

    #[test]
    fn blank_env_override_is_ignored() {
        let candidates = library_candidates_for(
            Some("  "),
            None,
            Some(Path::new("/opt/lumi/resources")),
            "linux",
            "x86_64",
        );

        assert_eq!(candidates[0], "libmpv.so.2");
        assert!(!candidates
            .iter()
            .any(|candidate| candidate.trim().is_empty()));
    }
}
