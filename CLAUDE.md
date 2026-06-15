# CLAUDE.md

Guidance for Claude (and other AI agents) working in this repository. Read this
first, then follow the links into `docs/` for the area you are touching.

## What this project is

**Kiro Chat** is a cross-platform desktop wrapper around the official **Kiro CLI**.
It installs the CLI for the current user (no admin rights), authenticates the
account, and runs `kiro-cli chat` inside a real terminal embedded in a chat-style
desktop window. Targets: **Windows 11 (NSIS, per-user)** and **Linux (deb + AppImage)**.

Stack: **Tauri 2 (Rust backend) + Vite + TypeScript + xterm.js (frontend)**. The
terminal is backed by a real PTY (`portable-pty`: ConPTY on Windows, openpty on
Linux).

## Quick start commands

```bash
npm install                                   # install frontend deps
npm run tauri dev                             # run the app in dev (Rust + Vite)
npm run typecheck                             # tsc --noEmit (frontend)
npm run build                                 # tsc + vite build → dist/
cargo test  --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build                           # produce installers for the host OS
```

CI runs typecheck + build (frontend) and clippy + tests (Rust) on both Windows
and Linux. **Before pushing, run `npm run typecheck`, `cargo clippy … -D warnings`,
and `cargo test`** — clippy warnings fail CI.

## Documentation map

| Doc | Read it when you are… |
|-----|-----------------------|
| [docs/architecture.md](docs/architecture.md) | Understanding how the pieces fit, the boot/setup flow, or the PTY/session model |
| [docs/ipc-contract.md](docs/ipc-contract.md) | Adding/changing a Tauri command or event — the Rust↔TS boundary |
| [docs/backend.md](docs/backend.md) | Editing anything under `src-tauri/src/` (Rust) |
| [docs/frontend.md](docs/frontend.md) | Editing anything under `src/` (TypeScript/UI) |
| [docs/build-and-release.md](docs/build-and-release.md) | Touching CI, bundling, versioning, icons, or installers |
| [docs/pipeline.md](docs/pipeline.md) | Working with the `forge → staging → main` agent pipeline — auto-merge, the review harness, or branch protection |

## Repository layout

```
src/                  Frontend (TypeScript, no framework — plain DOM)
src-tauri/src/        Backend (Rust, Tauri commands)
src-tauri/*.conf.json Tauri config (base + Linux overrides)
scripts/              Build helpers (icon generation, version sync)
.github/workflows/    CI (ci.yml) and Release (release.yml)
.githooks/            QAC commit-msg validation hook
.claude/skills/       Agent skills (qac-commits, update-docs)
docs/                 Architecture & contributor docs (this set)
```

## Conventions that matter

- **Commits by agents must follow QAC.** Every agent commit needs four trailers
  (`Agent`, `Mode`, `What`, `Why`) in that order. The `.githooks/commit-msg` hook
  enforces this and will reject non-compliant agent commits. Use the `qac-commits`
  skill to generate them. Enable the hook with `git config core.hooksPath .githooks`.
- **Comments explain *why*, not *what*.** The existing code comments document
  non-obvious constraints (ConPTY quirks, lock ordering, registry value kinds).
  Match that style — don't narrate the code.
- **No frontend framework.** The UI is hand-written DOM manipulation in `src/`.
  Keep it that way unless explicitly asked to introduce one.
- **i18n:** user-facing strings live in `src/i18n.ts` (pt-BR + en, chosen by
  `navigator.language`). Never hardcode user-facing text elsewhere.
- **Keep docs in sync.** After implementing a change that affects architecture,
  the IPC contract, build/release, or a module's responsibilities, update the
  relevant file in `docs/`. Use the `update-docs` skill.

## When you finish implementing

1. Run the checks above (typecheck, clippy, tests).
2. Update `docs/` if your change touched anything the docs describe (use the
   `update-docs` skill).
3. Commit with QAC trailers (use the `qac-commits` skill).
