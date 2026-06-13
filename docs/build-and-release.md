# Build & release

## Toolchain

- **Node.js 22+**, **Rust stable**.
- Linux dev/build also needs: `libwebkit2gtk-4.1-dev libgtk-3-dev pkg-config
  libssl-dev` (and for bundling: `libayatana-appindicator3-dev librsvg2-dev
  patchelf libfuse2 xdg-utils` — see the CI workflows for the exact list).

## Local commands

```bash
npm install                                   # frontend deps
npm run dev                                   # Vite only (port 1420, strict)
npm run tauri dev                             # full app (Rust + Vite)
npm run typecheck                             # tsc --noEmit
npm run build                                 # tsc + vite build → dist/
npm run tauri build                           # installers for the host OS
npm run icons                                 # regenerate icons (scripts/gen-icons.mjs)
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path src-tauri/Cargo.toml
```

`tauri build` output:
- **Windows** → NSIS installer at `src-tauri/target/release/bundle/nsis/*.exe`.
- **Linux** → `*.deb` and `*.AppImage` under `src-tauri/target/release/bundle/`.

## Tauri config

- `src-tauri/tauri.conf.json` — base config: product name, identifier
  (`dev.kirochat.app`), window size, `beforeDevCommand`/`beforeBuildCommand`
  (wired to the npm scripts), `frontendDist: ../dist`, and the **NSIS** bundle
  (per-user `installMode: currentUser` — no UAC; pt-BR + English; custom
  `installer-hooks.nsh`; `startMenuFolder`).
- `src-tauri/tauri.linux.conf.json` — Linux bundle overrides (`deb` depends on
  `curl`; `appimage`). Tauri merges this over the base config on Linux.
- `src-tauri/capabilities/default.json` — permission grants for the main window:
  `core:default`, `opener:default`, `dialog:default`. Add a grant here if you use
  a new plugin capability.
- `src-tauri/installer-hooks.nsh` — NSIS hooks; adds/removes a Start Menu shortcut
  that opens `kiro-cli` in a classic PowerShell window.

## CI — `.github/workflows/ci.yml`

Runs on every push (any branch) and PR, with in-progress cancellation per ref.
Jobs:
- **frontend** (ubuntu): `npm ci` → `typecheck` → `build`.
- **installer** (windows): builds the NSIS installer, uploads it as an artifact.
- **linux-bundle** (ubuntu-22.04): installs system deps → `build` → `clippy -D
  warnings` → `cargo test` → builds deb + AppImage, uploads them.
- **windows-checks** (windows): `build` → `clippy -D warnings` → `cargo test`.

**clippy warnings fail CI.** Linux bundles are built on **Ubuntu 22.04** on
purpose, for glibc compatibility (works on 22.04+).

## Release — `.github/workflows/release.yml`

Triggered by pushing a `v*` tag, or manually via `workflow_dispatch` with a `tag`
input. Flow:
1. `build-windows` and `build-linux` jobs sync the version from the tag
   (`node scripts/set-version.mjs "$TAG"` updates `package.json` and
   `tauri.conf.json`), run typecheck + clippy + tests, then `tauri build`, and
   upload bundles as artifacts.
2. `release` job downloads the artifacts and publishes a GitHub Release with the
   `.exe`, `.deb`, and `.AppImage` attached, auto-generated notes, and a fixed
   Portuguese install guide in the body. On manual `workflow_dispatch` it deletes
   any existing release/tag first (republish).

## Versioning

The single source of truth at release time is the **git tag** (e.g. `v0.1.0`).
`scripts/set-version.mjs` strips the `v`, validates semver, and writes the version
into `package.json` and `src-tauri/tauri.conf.json` so installers are named after
the tag. To cut a release: push a `vX.Y.Z` tag (or run the workflow with that tag).

## Icons

`scripts/gen-icons.mjs` (run via `npm run icons`) generates the full icon set
(PNGs + multi-size ICO) into `src-tauri/icons/` with **no external dependencies**
(a hand-rolled rasterizer). Re-run it if the icon design changes.
