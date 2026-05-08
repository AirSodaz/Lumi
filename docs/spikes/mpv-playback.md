# mpv Playback Spike

Date: 2026-05-08

## Decision

Lumi P6 uses runtime libmpv loading through Rust instead of a build-time `libmpv2` dependency or `tauri-plugin-libmpv`.

The Rust `PlayerService` remains Lumi's playback boundary. React calls `playback.open` and `playback.command`; it never calls mpv IPC, never receives an Emby token directly, and never builds stream URLs.

## Runtime Loading

The default backend loads libmpv only when playback starts. This keeps normal tests, type checks, and non-playback builds usable on machines that do not have mpv installed.

Load order:

1. `LUMI_LIBMPV_PATH`, when set.
2. Platform library names from the system loader path.
3. Platform library names next to the Lumi executable.
4. Bundled Tauri resource libraries under `$RESOURCE/libmpv/<platform>/`.

Current names:

- Windows: `mpv-2.dll`, `libmpv-2.dll`, `libmpv.dll`
- macOS: `libmpv.2.dylib`, `libmpv.dylib`
- Linux/dev fallback: `libmpv.so.2`, `libmpv.so`

If no library can be loaded, playback returns recoverable `playback.mpv_library_missing` with candidate paths and the `LUMI_LIBMPV_PATH` hint. Missing libmpv is a runtime playback diagnostic, not a build failure.

Release bundles can stage libmpv with:

```powershell
pwsh ./scripts/download-libmpv.ps1 -Platform auto -Manifest ./scripts/libmpv-sources.json
pnpm tauri:build
```

The script writes platform-specific files to `src-tauri/resources/libmpv/<platform>/`, and Tauri bundles that directory as `libmpv`. The source manifest is intentionally strict: each platform entry must pin `url`, `sha256`, `archiveType`, LGPL-compatible license metadata, source metadata, `mainLibraries`, and `copyGlobs`. If a platform has no audited manifest entry, the script fails before the build instead of downloading an unreviewed binary.

## Window Strategy

P6 creates an independent Tauri webview window per playback session and passes the native window id to libmpv through `wid`. The player window uses `index.html?playerWindow=1`, which renders a minimal black player host surface while mpv owns the native video output.

Supported native handle extraction:

- Windows `Win32`
- macOS `AppKit`
- Linux `Xlib` / `Xcb`

Unsupported handles return recoverable `playback.window_failed`.

## Command Mapping

Frontend command shape is tagged and TS-friendly:

- `{ kind: "play" }` -> `set pause no`
- `{ kind: "pause" }` -> `set pause yes`
- `{ kind: "seek", positionSeconds }` -> `seek <seconds> absolute`
- `{ kind: "setVolume", volume }` -> `set volume <volume>`
- `{ kind: "close" }` -> `quit`

P6 emits `playback:state-changed`, `playback:position`, and `playback:error`. Position events are session/UI signals and are not Emby progress reporting yet.

## License And Distribution Notes

mpv/libmpv is LGPL-oriented for dynamic linking, but mpv builds can include optional GPL components depending on how they are produced. Lumi must distribute libmpv as a replaceable dynamic library, include license notices, and document the exact binary source used for Windows and macOS release artifacts.

Do not silently bundle a GPL-constrained build into default Lumi releases.

Every staged bundle includes `LIBMPV_SOURCE.json` beside the copied dynamic libraries. Release notes and third-party notices must use that file as the source of truth for binary provenance.

## Alternatives Considered

- `libmpv2`: rejected for P6 default because its sys crate links `mpv` at build time, which would make ordinary `cargo test` and CI depend on a local mpv SDK.
- `tauri-plugin-libmpv`: useful reference for window-id embedding, but it adds a separate plugin command surface and wrapper distribution requirements. Lumi keeps playback under the Rust `PlayerService` boundary.
- External `mpv` process: useful as a future diagnostics fallback, but it is not the V1 default product path.

## Current Manual Status

This machine did not expose `mpv`, `pkg-config`, or a discoverable `mpv-2.dll` in the quick environment probe during planning. Automated tests use fake backends, and real playback should be manually verified after installing libmpv or setting `LUMI_LIBMPV_PATH`.

Manual playback is not marked complete until a playable movie or episode is opened, play/pause/seek/volume/close are tested, and the main window receives closed state.
