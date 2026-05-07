# Lumi

Lumi is a Tauri 2 desktop media aggregation client. The first implementation target is an Emby-first viewing loop with a Rust core service, React UI, native system materials, and a native mpv playback path.

## Development

```powershell
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm tauri:dev
```

## Verification

```powershell
pnpm build
pnpm tauri:build
```

Rust checks can be run from `src-tauri/`:

```powershell
cargo fmt --check
cargo check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

See the startup docs in [`docs/`](docs/) before changing product scope, architecture boundaries, UI material policy, or engineering conventions.
