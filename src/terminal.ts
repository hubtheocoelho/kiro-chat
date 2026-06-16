import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";

import {
  b64ToBytes,
  onPtyExit,
  onPtyOutput,
  ptyKill,
  ptyResize,
  ptySpawn,
  ptyWrite,
  type PtyExit,
  type PtyOutput,
  type SpawnMode,
} from "./ipc";
import { xtermThemes, type ThemeName } from "./theme";

export class TerminalView {
  readonly term: Terminal;
  onExit: (code: number | null) => void = () => {};

  private fit = new FitAddon();
  private generation = 0;
  private resizeTimer: number | undefined;
  private ready: Promise<Array<() => void>>;
  private spawning = false;
  // Events of the session being spawned can land before ptySpawn's response
  // assigns the generation (IPC events and invoke replies are not ordered),
  // so they are buffered while spawning and replayed after the assignment.
  private futureOutput: PtyOutput[] = [];
  private futureExit: PtyExit | null = null;
  // Dead-key/IME composed text (ã, õ, ç, a lone ~, CJK) does not flow through
  // xterm's canceled keypress path — the browser inserts it into xterm's hidden
  // helper textarea, which xterm only ever clears on Enter/Ctrl-C. So composed
  // characters pile up there and every xterm read (`_finalizeComposition`,
  // `_inputEvent`, `_handleAnyTextareaChanges`) returns the whole growing buffer
  // → the same key produces ~, then ~~, then ~~~ … As a thin terminal shell we
  // own this path: forward the composed text to the PTY exactly once and keep
  // the helper textarea empty so xterm can neither accumulate nor double-send.
  // This guard is reset on every keydown and set when a commit is delivered, so
  // a compositionend and its trailing `input` event are not both forwarded.
  private composedDelivered = false;

  constructor(private container: HTMLElement) {
    this.term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace',
      scrollback: 8000,
      theme: xtermThemes.dark,
    });
    this.term.loadAddon(this.fit);
    this.term.loadAddon(new WebLinksAddon((_event, uri) => void openUrl(uri)));
    this.term.open(container);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      this.term.loadAddon(webgl);
    } catch {
      // WebGL unavailable — xterm falls back to the DOM renderer
    }
    this.fit.fit();

    // TEMP DEBUG: trace dead-key/IME event flow on the user's WebKitGTK so the
    // duplication can be diagnosed from real data instead of guessed. Remove
    // once fixed. Toggle the panel with Ctrl+Alt+D.
    this.installImeDebug();

    // Plain keystrokes and control sequences (arrows, Ctrl-C, …) still flow
    // through xterm's keydown/keypress encoding untouched. Composed text is the
    // only thing we intercept (see composedDelivered / deliverComposed).
    this.term.onData((data) => {
      this.imeLog(`onData ${JSON.stringify(data)}`);
      if (this.generation) ptyWrite(this.generation, data).catch(() => {});
    });

    const ta = this.term.textarea;
    // A keydown begins a fresh key, so a new commit may follow: re-arm the guard.
    ta?.addEventListener("keydown", () => {
      this.composedDelivered = false;
    }, true);
    // compositionend fires when an IME/dead-key commits on webviews that emit
    // composition events (Chromium). Deliver the committed text.
    ta?.addEventListener("compositionend", (e) => this.deliverComposed(e.data));
    // The committed character also (or, on WebKitGTK, only) arrives as an
    // `input` event. Capturing on the container runs before xterm's own textarea
    // listener, so stopping it here keeps xterm's `_inputEvent` from re-reading
    // the helper textarea. Live IME composition (insertCompositionText /
    // isComposing) is left untouched so candidate editing keeps working.
    this.container.addEventListener(
      "input",
      (e) => {
        const ie = e as InputEvent;
        if (!ie.isComposing && ie.inputType === "insertText" && ie.data != null) {
          e.stopImmediatePropagation();
          this.deliverComposed(ie.data);
        }
      },
      true
    );
    new ResizeObserver(() => this.scheduleResize()).observe(container);

    this.ready = Promise.all([
      onPtyOutput((p) => {
        if (p.gen === this.generation) {
          this.term.write(b64ToBytes(p.data));
        } else if (this.spawning && p.gen > this.generation && this.futureOutput.length < 256) {
          this.futureOutput.push(p);
        }
      }),
      onPtyExit((p) => {
        if (p.gen === this.generation) {
          this.onExit(p.code);
        } else if (this.spawning && p.gen > this.generation) {
          this.futureExit = p;
        }
      }),
    ]);
  }

  // TEMP DEBUG — IME/dead-key event tracer. Remove once the bug is fixed.
  private imeDebugEl: HTMLElement | null = null;
  private imeLog(line: string): void {
    const el = this.imeDebugEl;
    if (!el) return;
    const ta = this.term.textarea;
    const tav = ta ? JSON.stringify(ta.value) : "?";
    const row = document.createElement("div");
    row.textContent = `${(performance.now() / 1000).toFixed(2)}  ${line}  ta=${tav}`;
    el.appendChild(row);
    while (el.childElementCount > 24) el.firstElementChild?.remove();
    el.scrollTop = el.scrollHeight;
  }

  private installImeDebug(): void {
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;right:8px;bottom:8px;z-index:99999;width:46ch;max-height:46vh;overflow:auto;" +
      "background:rgba(0,0,0,.85);color:#0f0;font:11px/1.35 monospace;padding:6px 8px;" +
      "border:1px solid #0f0;border-radius:6px;white-space:pre-wrap;pointer-events:none;display:block";
    const title = document.createElement("div");
    title.textContent = "IME DEBUG (Ctrl+Alt+D) — last events:";
    title.style.color = "#fff";
    el.appendChild(title);
    document.body.appendChild(el);
    this.imeDebugEl = el;

    const ta = this.term.textarea;
    ta?.addEventListener(
      "keydown",
      (e) =>
        this.imeLog(
          `keydown key=${JSON.stringify(e.key)} code=${e.keyCode} comp=${e.isComposing}`
        ),
      true
    );
    ta?.addEventListener("compositionstart", (e) =>
      this.imeLog(`compStart ${JSON.stringify(e.data)}`)
    );
    ta?.addEventListener("compositionupdate", (e) =>
      this.imeLog(`compUpdate ${JSON.stringify(e.data)}`)
    );
    ta?.addEventListener("compositionend", (e) =>
      this.imeLog(`compEnd ${JSON.stringify(e.data)}`)
    );
    ta?.addEventListener(
      "input",
      (e) => {
        const ie = e as InputEvent;
        this.imeLog(
          `input type=${ie.inputType} data=${JSON.stringify(ie.data)} comp=${ie.isComposing}`
        );
      },
      true
    );
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.altKey && (e.key === "d" || e.key === "D")) {
        el.style.display = el.style.display === "none" ? "block" : "none";
      }
    });
  }

  async spawn(mode: SpawnMode, cwd: string | null = null): Promise<void> {
    await this.ready;
    // Drop the previous session of this tab (restart in place) so it does
    // not linger in the backend.
    if (this.generation) {
      ptyKill(this.generation).catch(() => {});
      this.generation = 0;
    }
    this.spawning = true;
    this.futureOutput = [];
    this.takePendingExit();
    this.term.reset();
    this.fit.fit();
    try {
      const generation = await ptySpawn(mode, cwd, this.term.cols, this.term.rows);
      this.generation = generation;
      const replay = this.futureOutput.filter((p) => p.gen === generation);
      this.futureOutput = [];
      for (const p of replay) this.term.write(b64ToBytes(p.data));
      this.term.focus();
      const pendingExit = this.takePendingExit();
      if (pendingExit?.gen === generation) {
        this.onExit(pendingExit.code);
      }
    } finally {
      this.spawning = false;
    }
  }

  // Single source of truth for composed (dead-key/IME) text. Always clear the
  // helper textarea first: xterm only auto-clears it on Enter/Ctrl-C, so left
  // alone it accumulates composed characters and xterm's deferred reads
  // (scheduled at keydown) return the whole buffer. Then forward the committed
  // string once — the per-commit guard collapses a compositionend and its
  // trailing `input` event (or any other duplicate read) into a single write.
  private deliverComposed(data: string | null): void {
    if (this.term.textarea) this.term.textarea.value = "";
    if (!data || this.composedDelivered) return;
    this.composedDelivered = true;
    this.imeLog(`deliver ${JSON.stringify(data)}`);
    if (this.generation) ptyWrite(this.generation, data).catch(() => {});
  }

  private takePendingExit(): PtyExit | null {
    const exit = this.futureExit;
    this.futureExit = null;
    return exit;
  }

  setTheme(name: ThemeName): void {
    this.term.options.theme = xtermThemes[name];
  }

  focus(): void {
    this.term.focus();
  }

  // Refit after the tab pane becomes visible again; fitting a display:none
  // container would collapse the terminal to its minimum size.
  fitNow(): void {
    if (this.container.offsetWidth > 0) this.fit.fit();
  }

  dispose(): void {
    if (this.generation) {
      ptyKill(this.generation).catch(() => {});
      this.generation = 0;
    }
    void this.ready.then((unlisteners) => {
      for (const unlisten of unlisteners) unlisten();
    });
    window.clearTimeout(this.resizeTimer);
    this.term.dispose();
  }

  private scheduleResize(): void {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (this.container.offsetWidth === 0) return;
      const cols = this.term.cols;
      const rows = this.term.rows;
      this.fit.fit();
      if (this.generation && (this.term.cols !== cols || this.term.rows !== rows)) {
        ptyResize(this.generation, this.term.cols, this.term.rows).catch(() => {});
      }
    }, 50);
  }
}
