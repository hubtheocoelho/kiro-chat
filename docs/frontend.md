# Frontend (TypeScript / xterm.js)

Everything under `src/`. No framework — the UI is hand-written DOM, built once in
`main.ts` and mutated directly. Bundled by Vite, type-checked by `tsc` (strict,
`noUnusedLocals`/`noUnusedParameters` on). The frontend talks to the backend only
through `ipc.ts` ([ipc-contract.md](ipc-contract.md)).

## Files

### `main.ts` — app shell & orchestration
- Builds the full DOM (splash / setup / main screens) into `#app`.
- `boot()` — the startup flow (see [architecture.md](architecture.md#the-boot--first-run-flow)):
  load config → check system + locate CLI in parallel → wizard steps as needed →
  auth → open the first chat tab.
- **Tab model:** `Tab[]` with `newTab` / `closeTab` / `activateTab`. Each tab owns
  a `TerminalView`, a tab element, a pane, and an exit overlay (restart / close).
  Closing the last tab opens a fresh one.
- `spawnChat` / `runLogin` — spawn sessions and handle failures via banners.
- Top-bar actions: folder picker (sets `cwd`, persists config, opens a new tab in
  that folder), theme toggle (persists + re-themes all tabs), help link.
- `setBanner` / `bannerAsk` — recoverable errors with choice buttons.

### `terminal.ts` — `TerminalView`
One xterm.js terminal per tab, wrapping at most one live PTY session.
- Loads addons: `FitAddon`, `WebLinksAddon` (opens links via the OS), `WebglAddon`
  (falls back to DOM renderer if WebGL is unavailable).
- `spawn(mode, cwd)` — kills any previous session, resets the terminal, calls
  `pty_spawn`, stores the returned `generation`, replays buffered events.
- Forwards keystrokes (`term.onData` → `pty_write`) and applies output
  (`pty://output` → decode base64 → `term.write`).
- Buffers `pty://output`/`pty://exit` events that arrive before `pty_spawn`
  returns (IPC ordering isn't guaranteed) and replays them once `generation` is
  set. Caps the buffer at 256 events.
- Resize is debounced (50ms) and skipped when the pane is hidden
  (`offsetWidth === 0`) — fitting a `display:none` container collapses xterm.js.
- `dispose()` kills the session, unlistens, disposes the terminal.

### `wizard.ts` — `SetupWizard`
Renders the three-step checklist (system / install / login), a status line, a
collapsible technical log, and an action area. Methods resolve when the user acts:
`systemWarning`, `waitOnline` (loops until online), `runInstall` (calls
`install_kiro`, appends `install://progress` lines, retries with a copyable manual
command on failure), `askLogin`.

### `ipc.ts` — the IPC boundary
The only file that imports `invoke` / `listen`. Typed wrappers for every command
and event, the shared interfaces (`KiroInfo`, `SystemReport`, `AppConfig`,
`PtyOutput`, `PtyExit`), and `b64ToBytes` for decoding output. **Add new IPC here**
and keep field names camelCase to match serde.

### `i18n.ts` — strings
`ptBR` is the source dictionary; `en` mirrors its type (`Dict`). `t` is chosen by
`navigator.language` (pt → pt-BR, else en). `fmt(template, vars)` interpolates
`{name}` placeholders. **All user-facing text goes here** — adding a string means
adding it to *both* dictionaries (the type enforces this).

### `theme.ts` — theming
`xtermThemes` (dark/light `ITheme`s) for terminals and `applyCssTheme` which sets
`document.documentElement.dataset.theme` (CSS variables in `styles.css` react to
it). Theme choice is persisted in `AppConfig`.

### `ui.ts` — buttons
`actionButtons(specs)` builds `<button>`s from `ActionSpec { label, primary?,
onClick }`. Used by banners and the wizard.

### `styles.css`
All styling, driven by CSS custom properties switched on `[data-theme]`.

## Conventions

- **Keep it framework-free.** Build DOM with `document.createElement` /
  `innerHTML`, mutate via `byId` helpers. Don't add React/Vue/etc. unasked.
- **All IPC through `ipc.ts`.** Never call `invoke`/`listen` elsewhere.
- **All user-facing strings through `i18n.ts`**, in both `ptBR` and `en`.
- **Respect the session/generation model** in `terminal.ts` — route by `gen`,
  buffer pre-spawn events, kill before re-spawn.
- Strict TS: no unused locals/params, no implicit fallthrough. Run
  `npm run typecheck` before pushing.

## Local checks

```bash
npm run typecheck    # tsc --noEmit
npm run build        # tsc + vite build → dist/
npm run tauri dev    # full app (needs Rust toolchain + Linux: see README deps)
```
