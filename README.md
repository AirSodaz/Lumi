# Lumi

Lumi is a Tauri 2 desktop media aggregation client. V1 is an Emby-first desktop viewing loop with a Rust core service, React UI, SQLite local state, system keyring credentials, native system-material intent, and runtime-loaded libmpv playback.

## V1 Experience

The current product surface is intentionally small:

- Home shows the active Emby server, Continue Watching, Media Libraries, and latest media rails.
- Favorites is a read-only Emby favorites page with lazy loading.
- Search is a V1 shell entry for connected-server search work.
- Settings groups Media Services, player preferences, appearance/material fallback state, language, and log export.
- Media library browsing lives under the Home `Media Libraries` rail rather than a top-level Libraries tab.
- Playback opens through the Rust `PlayerService`; React never builds Emby stream URLs, sees tokens, or talks to mpv directly.

## Install

Required local tools:

- Node.js and pnpm
- Rust and Cargo
- Tauri system prerequisites for the target platform
- A reachable Emby server for manual V1 validation
- libmpv for real playback validation

Install JavaScript dependencies:

```powershell
pnpm install
```

Rust dependencies are resolved by Cargo from `src-tauri/`.

## Development

Start the web UI only:

```powershell
pnpm dev
```

Start the Tauri desktop app:

```powershell
pnpm tauri:dev
```

Common checks:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Rust checks from `src-tauri/`:

```powershell
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

## Playback And libmpv

Lumi loads libmpv at playback time, not at build time. Normal tests and non-playback development do not require mpv to be installed.

Runtime load order:

1. `LUMI_LIBMPV_PATH`, when set.
2. Platform library names from the system loader path.
3. Platform library names beside the Lumi executable.
4. Bundled Tauri resources under `libmpv/<platform>/`.
5. Development fallback under `src-tauri/resources/libmpv/<platform>/` for local target builds.

Windows release bundles can stage the audited LGPL-oriented libmpv source with:

```powershell
pwsh ./scripts/download-libmpv.ps1 -Platform auto -Manifest ./scripts/libmpv-sources.json
pnpm tauri:build
```

For local debugging without staging a bundle, point directly at a dynamic library:

```powershell
$env:LUMI_LIBMPV_PATH="C:\path\to\libmpv-2.dll"
pnpm tauri:dev
```

Settings -> Player shows the mpv diagnostic surface. If playback fails to load the native library, the recoverable error is `playback.mpv_library_missing` and includes the candidate paths.

## Debugging

- Settings -> Logs exports recent diagnostics without Emby tokens or passwords.
- Settings -> Player shows the native mpv diagnostic.
- Settings -> Appearance shows whether material effects are enabled and why the app is using a fallback surface.
- For playback issues, capture the visible `playback.*` error code plus the exported diagnostics.
- Do not paste real Emby tokens, server URLs, passwords, or private logs into tracked files.

## Build

Build the frontend:

```powershell
pnpm build
```

Build the Tauri app:

```powershell
pnpm tauri:build
```

Build a debug bundle for validation:

```powershell
pnpm tauri build --debug
```

## V1 Validation

The V1 validation checklist is in [`docs/validation/v1-acceptance.md`](docs/validation/v1-acceptance.md). It separates automated checks from manual checks that need a real Emby server, staged or installed libmpv, Windows 11 shell validation, and macOS validation.

Release notes are drafted in [`docs/release-notes/v0.1.0-draft.md`](docs/release-notes/v0.1.0-draft.md).

## Known Limits

- V1 is Emby-first. Jellyfin, Plex, NAS, local-folder libraries, Live TV, DVR, offline download, and cross-provider aggregation are out of scope.
- Favorites are read-only and scoped to the selected Emby server.
- Search is present as a product entry but is not yet a complete cross-library search experience.
- Native material probing currently reports a fallback state; CSS content glass is only a visual supplement, not a claim of native Mica/Acrylic or macOS vibrancy.
- Windows libmpv staging has audited manifest entries. macOS libmpv bundle sources are not yet audited in `scripts/libmpv-sources.json`.
- Real playback and progress sync require manual validation with an Emby server and libmpv.

See the docs in [`docs/`](docs/) before changing product scope, architecture boundaries, UI material policy, playback strategy, or engineering conventions.
