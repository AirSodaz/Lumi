# Lumi V1 Acceptance Checklist

Status: P8 validation document. This file separates automated evidence from manual checks that require a real Emby server, staged or installed libmpv, Windows 11 shell behavior, and macOS hardware.

## Automated Checks

| Check | Status | Evidence |
| --- | --- | --- |
| `pnpm typecheck` | Passed | Exit 0; `tsc --noEmit`. |
| `pnpm test` | Passed | Exit 0; 14 test files and 115 tests passed. |
| `pnpm build` | Passed | Exit 0; Vite built `dist/`. It warned that the main JS chunk is larger than 500 kB and reported plugin timing warnings. |
| `cargo fmt --check` | Failed | Exit 1; rustfmt reported existing formatting diffs in `src-tauri/src/commands/auth.rs` and `src-tauri/tests/emby_provider_contract.rs`. |
| `cargo clippy --all-targets --all-features -- -D warnings` | Failed | Exit 1; clippy reported `clippy::unnecessary_cast` at `src-tauri/src/commands/playback.rs:367`. |
| `cargo test` | Passed | Exit 0; Rust unit/integration/doc tests passed. |
| `pnpm tauri build --debug` | Failed | Exit 1; frontend build completed, then Tauri failed to remove `src-tauri/target/debug/lumi.exe` with Windows access denied error 5, consistent with a local process holding the executable. |
| `git diff --check` | Passed | Exit 0; only Git CRLF working-copy warnings for edited Markdown files. |

## Manual Emby E2E

| Scenario | Status | Notes |
| --- | --- | --- |
| New user connects an Emby server manually within 3 minutes | Pending manual | Requires real Emby URL, username, and password. Do not record credentials in the repo. |
| Logged-in user opens app and sees Continue Watching | Pending manual | Requires a saved profile with Emby progress data. |
| User browses Home -> Media Libraries -> item detail | Pending manual | Validate mouse and keyboard navigation. |
| User opens a movie or episode through native libmpv | Pending manual | Requires libmpv and playable Emby media. |
| User performs play, pause, seek, volume, and close | Pending manual | Verify `PlayerSession` state updates in the UI. |
| Playback exit updates Emby progress and local UI | Pending manual | Confirm on Emby and in Lumi Home/detail progress surfaces. |
| Favorites page lists selected server's Emby favorites | Pending manual | V1 is read-only and current-server scoped. |

## Windows 11 Platform Checks

| Scenario | Status | Notes |
| --- | --- | --- |
| Mica/Acrylic window behavior | Pending manual | Current Settings material state reports fallback probing; visually verify Tauri window effects separately. |
| Player window opens and renders video | Pending manual | Requires staged or installed libmpv. |
| Player full-screen behavior | Pending manual | Validate keyboard escape/close behavior and focus return. |
| Debug installer or bundle starts | Pending manual | Requires `pnpm tauri build --debug` output and local install/run. |
| Logs export omits token/password | Pending manual | Automated tests cover token omission; manually inspect exported log text before release. |

## macOS Platform Checks

| Scenario | Status | Notes |
| --- | --- | --- |
| Liquid Glass/vibrancy available range | Not covered | No macOS machine participated in this P8 pass. |
| Material fallback messaging | Not covered | Verify Settings -> Appearance on target macOS. |
| Player window opens and renders video | Not covered | Requires macOS libmpv source decision plus manual playback. |
| Bundle constraints and signing impact | Not covered | macOS libmpv source is not yet audited in `scripts/libmpv-sources.json`. |

## Documentation Hygiene

| Check | Status | Notes |
| --- | --- | --- |
| README documents install, dev, debug, build, libmpv, and limits | Passed | Updated in P8 docs pass. |
| Architecture doc matches current V1 boundaries | Passed | Documents Home/Favorites IA, SQLite/keyring, Emby provider, runtime mpv, and fallback material probing. |
| Product vision separates implemented, non-V1, and pending manual items | Passed | Updated in P8 docs pass. |
| UI design system records current tokens, focus strategy, and material fallback | Passed | Updated in P8 docs pass. |
| Release notes draft includes platform requirements, libmpv notice, and known limits | Passed | Added `docs/release-notes/v0.1.0-draft.md`. |
| Tracked docs avoid tokens, real server URLs, passwords, private logs, and screenshots | Passed | `rg` over `README.md` and `docs/` found only generic token/secret policy text, not concrete credentials, private logs, screenshots, or real server addresses. |

## Release Gate

v0.1.0 should not be marked ready until:

- All automated checks in this file are Passed or have an explicit release-approved exception.
- Current automated blockers are rustfmt drift, clippy `unnecessary_cast`, and the Windows file lock that blocked `pnpm tauri build --debug`.
- Windows 11 playback and installer checks are completed.
- Real Emby login -> browse -> play -> close -> progress sync is completed.
- macOS packaging and libmpv source policy are either validated or explicitly excluded from the release artifact set.
