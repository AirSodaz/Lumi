use std::{
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

use serde::{Deserialize, Serialize};

use crate::{
    errors::{AppError, AppResult},
    persistence::{
        CredentialStore, Database, LocalStore, MemoryCredentialStore, SystemCredentialStore,
    },
    player::{PlaybackSessionStore, PlayerBackend, RuntimeMpvBackend},
    providers::{
        emby::{Clock, EmbyHttpTransport, ReqwestEmbyHttpTransport, SystemClock},
        ProviderRegistry, ServerProfile,
    },
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: ThemePreference,
    pub material_effects_enabled: bool,
    pub player: PlayerSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemePreference::System,
            material_effects_enabled: true,
            player: PlayerSettings::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemePreference {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSettings {
    pub default_volume: u8,
    pub subtitle_preference: SubtitlePreference,
}

impl Default for PlayerSettings {
    fn default() -> Self {
        Self {
            default_volume: 100,
            subtitle_preference: SubtitlePreference::ServerDefault,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SubtitlePreference {
    ServerDefault,
    Always,
    Off,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsPatch {
    pub theme: Option<ThemePreference>,
    pub material_effects_enabled: Option<bool>,
    pub default_volume: Option<u8>,
    pub subtitle_preference: Option<SubtitlePreference>,
}

pub struct AppState {
    provider_registry: ProviderRegistry,
    local_store: Arc<LocalStore>,
    credential_store: Arc<dyn CredentialStore>,
    emby_transport: Arc<dyn EmbyHttpTransport>,
    clock: Arc<dyn Clock>,
    player_backend: Arc<dyn PlayerBackend>,
    player_sessions: Arc<PlaybackSessionStore>,
    settings: RwLock<AppSettings>,
}

impl Default for AppState {
    fn default() -> Self {
        let database = Database::open_in_memory().expect("open in-memory Lumi database");
        database
            .initialize()
            .expect("initialize in-memory Lumi database");
        Self::with_services(
            Arc::new(LocalStore::new(database)),
            Arc::new(MemoryCredentialStore::default()),
            Arc::new(ReqwestEmbyHttpTransport::default()),
            Arc::new(SystemClock),
        )
    }
}

impl AppState {
    pub fn persistent(database_path: impl AsRef<Path>) -> AppResult<Self> {
        Self::persistent_with_resource_dir(database_path, None)
    }

    pub fn persistent_with_resource_dir(
        database_path: impl AsRef<Path>,
        resource_dir: Option<PathBuf>,
    ) -> AppResult<Self> {
        let database = Database::open(database_path)?;
        database.initialize()?;
        Ok(Self::with_services_and_player(
            Arc::new(LocalStore::new(database)),
            Arc::new(SystemCredentialStore::new()?),
            Arc::new(ReqwestEmbyHttpTransport::new()?),
            Arc::new(SystemClock),
            Arc::new(RuntimeMpvBackend::new(resource_dir)),
        ))
    }

    pub fn with_services(
        local_store: Arc<LocalStore>,
        credential_store: Arc<dyn CredentialStore>,
        emby_transport: Arc<dyn EmbyHttpTransport>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self::with_services_and_player(
            local_store,
            credential_store,
            emby_transport,
            clock,
            Arc::new(RuntimeMpvBackend::default()),
        )
    }

    pub fn with_services_and_player(
        local_store: Arc<LocalStore>,
        credential_store: Arc<dyn CredentialStore>,
        emby_transport: Arc<dyn EmbyHttpTransport>,
        clock: Arc<dyn Clock>,
        player_backend: Arc<dyn PlayerBackend>,
    ) -> Self {
        let settings = local_store.settings().unwrap_or_default();

        Self {
            provider_registry: ProviderRegistry::default(),
            local_store,
            credential_store,
            emby_transport,
            clock,
            player_backend,
            player_sessions: Arc::new(PlaybackSessionStore::default()),
            settings: RwLock::new(settings),
        }
    }

    pub fn provider_registry(&self) -> &ProviderRegistry {
        &self.provider_registry
    }

    pub fn local_store(&self) -> Arc<LocalStore> {
        self.local_store.clone()
    }

    pub fn credential_store(&self) -> Arc<dyn CredentialStore> {
        self.credential_store.clone()
    }

    pub fn emby_transport(&self) -> Arc<dyn EmbyHttpTransport> {
        self.emby_transport.clone()
    }

    pub fn clock(&self) -> Arc<dyn Clock> {
        self.clock.clone()
    }

    pub fn player_backend(&self) -> Arc<dyn PlayerBackend> {
        self.player_backend.clone()
    }

    pub fn player_sessions(&self) -> Arc<PlaybackSessionStore> {
        self.player_sessions.clone()
    }

    pub fn list_servers(&self) -> AppResult<Vec<ServerProfile>> {
        self.local_store.list_server_profiles()
    }

    pub fn settings(&self) -> AppSettings {
        self.settings
            .read()
            .map(|settings| settings.clone())
            .unwrap_or_else(|_| AppSettings::default())
    }

    pub fn update_settings(&self, patch: AppSettingsPatch) -> AppResult<AppSettings> {
        let mut settings_guard = self
            .settings
            .write()
            .map_err(|_| AppError::state_lock_poisoned("settings"))?;
        let mut settings = settings_guard.clone();

        if let Some(theme) = patch.theme {
            settings.theme = theme;
        }

        if let Some(material_effects_enabled) = patch.material_effects_enabled {
            settings.material_effects_enabled = material_effects_enabled;
        }

        if let Some(default_volume) = patch.default_volume {
            settings.player.default_volume = default_volume.min(100);
        }

        if let Some(subtitle_preference) = patch.subtitle_preference {
            settings.player.subtitle_preference = subtitle_preference;
        }

        self.local_store.update_settings(&settings)?;

        *settings_guard = settings.clone();

        Ok(settings.clone())
    }
}
