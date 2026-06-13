# IPC contract (Rust ↔ TypeScript)

This is the boundary between backend and frontend. **Both sides must stay in sync.**

- Backend commands are `#[tauri::command]` functions registered in
  `src-tauri/src/main.rs`'s `invoke_handler!`.
- Frontend wrappers live in `src/ipc.ts` — the **only** file that calls `invoke`
  or `listen`. Everything else imports from there.
- Rust structs returned to the frontend use `#[serde(rename_all = "camelCase")]`,
  so a Rust field `arch_ok` becomes `archOk` in TypeScript. Keep the TS interfaces
  in `ipc.ts` matching.

## Commands (frontend → backend, request/response)

| Command | Args | Returns | Defined in |
|---------|------|---------|------------|
| `pty_spawn` | `mode: "chat"\|"login"\|"shell"`, `cwd: string\|null`, `cols`, `rows` | `number` (generation) | `pty.rs` |
| `pty_write` | `generation: number`, `data: string` | `void` | `pty.rs` |
| `pty_resize` | `generation: number`, `cols`, `rows` | `void` | `pty.rs` |
| `pty_kill` | `generation: number` | `void` | `pty.rs` |
| `locate_kiro` | — | `KiroInfo \| null` | `kiro.rs` |
| `check_auth` | — | `boolean` | `kiro.rs` |
| `install_kiro` | — | `KiroInfo` | `kiro.rs` |
| `check_system` | — | `SystemReport` | `deps.rs` |
| `get_config` | — | `AppConfig` | `config.rs` |
| `set_config` | `config: AppConfig` | `void` | `config.rs` |

### Spawn modes

`pty_spawn`'s `mode` selects what runs:
- `chat` → `kiro-cli chat` in `cwd` (the workspace folder).
- `login` → `kiro-cli login` (no cwd).
- `shell` → the default shell (`powershell.exe -NoLogo` on Windows, `$SHELL` else).

The backend resolves the binary path via `kiro::locate`. A stale/missing `cwd`
falls back to the home directory rather than failing the spawn.

## Events (backend → frontend, streamed)

| Event | Payload | Emitted by | Consumed by |
|-------|---------|------------|-------------|
| `pty://output` | `{ gen: number, data: string }` — `data` is **base64** | `pty.rs` reader thread | `terminal.ts` |
| `pty://exit` | `{ gen: number, code: number\|null }` | `pty.rs` waiter thread | `terminal.ts` |
| `install://progress` | `{ line: string }` | `kiro.rs` installer | `wizard.ts` |

`pty://output.data` is base64-encoded raw bytes (terminal output isn't guaranteed
valid UTF-8). The frontend decodes it with `b64ToBytes` (`ipc.ts`) and writes the
`Uint8Array` straight to xterm.js.

**Every PTY event carries `gen`** so a `TerminalView` can route output to the tab
that owns the session and drop output from sessions it abandoned. Events may also
arrive *before* the matching `pty_spawn` reply (IPC events and invoke replies are
not ordered) — `terminal.ts` buffers them while `spawning` and replays once the
generation is assigned.

## Shared types

These Rust structs cross the boundary; their TS mirrors are in `ipc.ts`:

```
KiroInfo     { path: string, version: string | null }
SystemReport { os: string, win11: boolean, archOk: boolean, online: boolean }
AppConfig    { kiroPath: string | null, theme: "dark"|"light"|null, cwd: string | null }
```

## Adding or changing the contract — checklist

1. **Backend:** write/modify the `#[tauri::command]` fn (or the emit call for an
   event). If it returns a struct, derive `Serialize` and add
   `#[serde(rename_all = "camelCase")]`.
2. **Register:** add the command to the `invoke_handler!` macro in `main.rs`
   (commands only; events don't need registration).
3. **Frontend:** add/update the typed wrapper and any interface in `src/ipc.ts`.
   Keep field names in camelCase to match serde output.
4. **Permissions:** if the change uses a Tauri plugin capability not already
   granted, update `src-tauri/capabilities/default.json` (current grants:
   `core:default`, `opener:default`, `dialog:default`).
5. Run `npm run typecheck` and `cargo clippy … -D warnings` — mismatches surface
   as TS or Rust errors.
6. Update this file and, if the behavior is new, [architecture.md](architecture.md).
