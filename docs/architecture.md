# Architecture

Kiro Chat is a Tauri 2 desktop app. A Rust backend owns the operating-system
side (locating/installing the CLI, spawning PTYs, persisting config) and a
TypeScript frontend owns the UI (setup wizard, terminal tabs, theming). They
communicate only through Tauri's IPC: **commands** (frontend → backend, request/
response) and **events** (backend → frontend, streamed). See
[ipc-contract.md](ipc-contract.md) for the exact surface.

```
┌──────────────────────────── Frontend (src/, WebView) ───────────────────────────┐
│  main.ts        boot flow, screen/tab orchestration, top bar, banners            │
│  wizard.ts      first-run setup wizard (system → install → login)                │
│  terminal.ts    TerminalView: one xterm.js instance per tab, wraps a PTY session │
│  ipc.ts         typed wrappers over invoke() / listen() — the only IPC surface    │
│  i18n.ts        pt-BR / en strings   theme.ts  xterm + CSS themes   ui.ts buttons │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                        │  Tauri IPC (commands ↑ / events ↓)
┌──────────────────────────────────────┴──────────── Backend (src-tauri/src/) ─────┐
│  main.rs    registers plugins, PtyState, and the invoke handler                   │
│  pty.rs     PTY sessions: spawn/write/resize/kill, output/exit events             │
│  kiro.rs    locate / version / auth-check / install the Kiro CLI; chat & login    │
│  deps.rs    system report (OS, Win11, arch, connectivity)                         │
│  config.rs  load/save AppConfig (kiroPath, theme, cwd) as JSON                    │
│  path_env.rs persist install dir into the user PATH (Windows registry)            │
│  proc.rs    helpers: hide child windows, run a command with a timeout             │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## Backend (Rust)

`main.rs` is a thin entrypoint: it installs the `opener` and `dialog` plugins,
registers `PtyState` as managed state, and wires up the `invoke_handler` with all
commands. Modules:

- **`pty.rs`** — the core. Owns `PtyState`, which holds two maps keyed by a
  monotonic `generation` (session id): one of `PtySession` (master PTY + child
  killer), one of per-session writers. Spawning starts two threads per session: a
  reader that base64-encodes output and emits `pty://output`, and a waiter that
  emits `pty://exit` and removes the session from the maps when the child dies.
- **`kiro.rs`** — everything CLI-specific: a layered search to *locate* the
  binary (stored path → PATH → known per-user dirs → scan of Windows Programs),
  reading its `--version`, checking auth via `kiro-cli whoami`, and running the
  official installer (`cli.kiro.dev`) while streaming progress as
  `install://progress`. Also builds the `SpawnSpec` for `chat` and `login` modes.
- **`deps.rs`** — `check_system` returns OS, whether the host is Windows 11
  (build ≥ 22000), whether the arch is supported, and online connectivity (TCP
  connect to `cli.kiro.dev:443` / `github.com:443`).
- **`config.rs`** — `AppConfig { kiroPath, theme, cwd }` persisted as
  `config.json` in the app config dir.
- **`path_env.rs`** — Windows-only: appends the install dir to `HKCU\Environment`
  PATH, preserving the original registry value kind (so `REG_EXPAND_SZ` entries
  like `%USERPROFILE%` aren't destroyed). No-op on Unix.
- **`proc.rs`** — `hide()` (CREATE_NO_WINDOW on Windows so helper invocations
  don't flash a console) and `output_with_timeout()` (bounded `Command::output`
  so a hung probe can't freeze the app).

## Frontend (TypeScript)

No framework — plain DOM built in `main.ts`. Three screens (splash, setup, main);
`show()` toggles which is visible.

- **`main.ts`** — drives `boot()`, manages the tab model (`Tab[]`,
  `newTab`/`closeTab`/`activateTab`), spawns chat/login sessions, and wires the
  top-bar actions (folder picker, theme toggle, help). Banners surface
  recoverable errors with retry/reset choices.
- **`terminal.ts`** — `TerminalView` wraps one xterm.js terminal: loads fit /
  web-links / webgl addons, forwards keystrokes via `pty_write`, applies output
  from `pty://output`, and handles resize (debounced) and disposal. It tracks the
  current `generation` and buffers events that arrive before `pty_spawn` returns
  (IPC events and invoke replies are not ordered).
- **`wizard.ts`** — `SetupWizard` renders the three-step checklist and the
  install log, and exposes `systemWarning` / `waitOnline` / `runInstall` /
  `askLogin`, each resolving when the user acts.
- **`ipc.ts`** — the **only** place that calls `invoke`/`listen`. Every command
  and event has a typed wrapper here; the rest of the frontend imports these.

## The boot / first-run flow

`boot()` in `main.ts` orchestrates startup. It is idempotent — re-checks on every
launch and self-repairs:

1. Load `AppConfig`, apply theme.
2. In parallel: `check_system` and `locate_kiro` (locating must not wait on the
   network).
3. If on Windows and not Win11/unsupported arch → show wizard `systemWarning`
   (user may continue anyway). If offline → `waitOnline` (loops until online).
4. If the CLI wasn't located → wizard `runInstall` (runs the official installer,
   streams progress, retries on failure with a manual-command fallback).
5. `check_auth`. If not authenticated → wizard `askLogin`, then `runLogin`
   (spawns `kiro-cli login`, waits for exit, re-checks auth, loops on failure).
6. Show the main screen and open the first chat tab.

## Session / tab model

Each UI tab owns one `TerminalView`, which owns at most one live PTY session at a
time. The backend supports **many concurrent sessions** — each tab can run its
own `kiro-cli chat` in its own working directory. Sessions are identified by a
monotonic `generation`:

- Every `pty://output` / `pty://exit` event carries its `gen`, so a `TerminalView`
  routes only its own session's output and ignores the rest.
- Restarting a session in a tab (`spawn` again) kills the old generation first so
  it doesn't linger in the backend.
- Closing a tab disposes the `TerminalView`, which kills the session and unlistens.

### Concurrency notes (backend)

`pty.rs` is written to keep one slow/blocked session from wedging the others:

- Each session's **writer lives behind its own lock**. `pty_write` clones the
  `Arc<Mutex<Writer>>` and drops the map lock *before* writing, so a write blocked
  on a full pipe never holds the shared map lock.
- **Kill before dropping the writer:** a write blocked on a stuffed pipe only
  returns once the child dies, so `kill_session` kills the child first.
- The session is **registered in the maps before** the exit-watcher thread starts,
  so a child that dies instantly can't have its entries removed before they exist.

## External dependencies & assumptions

- The **official Kiro CLI** is downloaded from `cli.kiro.dev` (PowerShell script
  on Windows, shell script on Linux). Its install destination is *not*
  contractual, which is why `locate()` searches several known locations.
- Authentication is delegated entirely to `kiro-cli login` (AWS Builder ID /
  Google / GitHub) and verified with `kiro-cli whoami`.
- The app never parses the CLI's chat output — xterm.js renders it directly.
