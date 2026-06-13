# Backend (Rust / Tauri)

Everything under `src-tauri/src/`. The backend is the OS-facing half: it locates
and installs the Kiro CLI, runs PTY sessions, persists config, and edits the user
PATH. It exposes its capabilities to the frontend only through the IPC contract
([ipc-contract.md](ipc-contract.md)).

## Module responsibilities

### `main.rs`
Entrypoint. Sets `windows_subsystem = "windows"` in release (no console window),
declares the modules, installs the `opener` and `dialog` plugins, registers
`PtyState` as managed state, and lists every command in `generate_handler!`. When
you add a command, it must be added here.

### `pty.rs` — terminal sessions
The heart of the app. Key pieces:

- `PtyState` (managed, `Default`): two `Arc<Mutex<HashMap<u64, _>>>` keyed by
  `generation` — one of `PtySession { master, killer }`, one of `SharedWriter`
  (`Arc<Mutex<Box<dyn Write + Send>>>`). Per-session writer locks so a blocked
  write can't wedge other sessions.
- `NEXT_GENERATION: AtomicU64` — monotonic session ids.
- `spawn_session()` — opens a PTY, builds the command (sets `COLORTERM`,
  `TERM_PROGRAM`, `TERM`; falls back to home dir for a bad cwd), spawns the child,
  then starts two threads: a **reader** (base64-encodes chunks → emits
  `pty://output`) and a **waiter** (emits `pty://exit`, removes map entries on
  exit). Registers the session in the maps *before* the waiter starts.
- Commands: `pty_spawn` (dispatches on mode → `kiro::chat_spec` / `login_spec` /
  `default_shell`), `pty_write`, `pty_resize`, `pty_kill`.
- Has a `#[cfg(test)]` round-trip test that answers the ConPTY cursor-position
  (DSR `ESC[6n`) query itself — ConPTY stalls output until the terminal replies.

**Concurrency invariants** (don't break these):
- Clone the writer `Arc` and drop the map lock *before* writing.
- Kill the child *before* dropping its writer (a write on a full pipe only
  unblocks when the child dies).
- Register session map entries *before* spawning the exit watcher.

### `kiro.rs` — the Kiro CLI
- `locate()` / `locate_fresh()` — layered search: stored path (from config) →
  `PATH` → known per-user dirs (`~/.local/bin`, `~/.kiro/bin`, Windows
  `%LOCALAPPDATA%\Programs\kiro-cli`…) → scan of `%LOCALAPPDATA%\Programs` for
  `kiro*`. The installer's destination is not contractual, hence the layers.
- `version()` — runs `--version` with a timeout, parses the last token.
- `chat_spec()` / `login_spec()` — build `SpawnSpec`s for `pty_spawn`.
- `check_auth` — runs `kiro-cli whoami` (success = authenticated).
- `install_kiro` / `install_blocking` — runs the official installer
  (`installer_command()`: PowerShell `irm | iex` on Windows, `curl | bash` on
  Linux), streams stdout/stderr lines as `install://progress`, keeps a 16-line
  tail for error reporting, then re-locates the binary and ensures PATH.
- On success it persists the located path into config (`persist_path`).

### `deps.rs` — system report
`check_system` → `SystemReport { os, win11, archOk, online }`. `win11` is true
when the Windows build is ≥ 22000 (read from the registry via `reg query`), or on
non-Windows where the requirement doesn't apply. `online` probes TCP 443 to
`cli.kiro.dev` / `github.com` with a 2s timeout.

### `config.rs` — persistence
`AppConfig { kiro_path, theme, cwd }` (camelCase over IPC), stored as pretty JSON
in `app_config_dir()/config.json`. `load` returns `Default` on any error;
`get_config` / `set_config` are the commands.

### `path_env.rs` — Windows PATH (Windows-only)
`ensure_user_path(dir)` appends `dir` to `HKCU\Environment` PATH **preserving the
original registry value kind** — reading/writing raw avoids expanding
`REG_EXPAND_SZ` entries like `%USERPROFILE%` and destroying them. Returns whether
PATH changed. No-op on Unix (the installer already targets `~/.local/bin`, which
login shells put on PATH).

### `proc.rs` — process helpers
- `hide(cmd)` — sets `CREATE_NO_WINDOW` on Windows so helper invocations (reg,
  powershell, CLI probes) don't flash a console. No-op elsewhere.
- `output_with_timeout(cmd, timeout)` — bounded `Command::output`; kills a child
  that exceeds the deadline. Only for small outputs (pipes drained after exit).

## Cross-platform rules

- Use `#[cfg(windows)]` / `#[cfg(not(windows))]` for OS-specific behavior, and
  provide a no-op or fallback for the other side (see `path_env`, `scan_programs`,
  `proc::hide`). Code must compile on both — CI runs clippy + tests on Windows and
  Linux.
- Never spawn a visible console for a background probe; route it through
  `proc::hide` / `output_with_timeout`.
- Any long-running OS call exposed as a command should run on a blocking thread
  (`tauri::async_runtime::spawn_blocking`) — see `locate_kiro`, `check_auth`,
  `install_kiro`, `check_system`.

## Local checks

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path src-tauri/Cargo.toml
```

clippy warnings are errors in CI. The PTY round-trip test in `pty.rs` works on
both ConPTY and openpty.
