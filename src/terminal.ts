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
  // xterm's composition path drops dead-key/IME input under WebKitGTK (the
  // Linux webview): the composed character (ã, õ, ç, a lone ~) never reaches
  // onData and is swallowed. We forward the composed text ourselves; this slot
  // holds the in-flight string so the duplicate is suppressed on webviews
  // (WebView2/Chromium) where xterm *does* deliver it through onData.
  private pendingComposition: string | null = null;

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

    this.term.onData((data) => {
      // xterm delivered the composed text through its normal path — keep it,
      // just clear the slot so handleCompositionEnd does not resend it.
      if (data === this.pendingComposition) this.pendingComposition = null;
      if (this.generation) ptyWrite(this.generation, data).catch(() => {});
    });
    // open() created the helper textarea; forward composed input from there so
    // dead keys work on WebKitGTK. Capture would race xterm's own listener, so
    // bind in the bubble phase (after xterm) to observe whether it sent first.
    this.term.textarea?.addEventListener("compositionend", (e) =>
      this.handleCompositionEnd(e)
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

  // Forward dead-key/IME composed text that WebKitGTK never routes through
  // xterm's onData. We optimistically assume xterm will deliver it: if its
  // onData fires first (Chromium-based webviews) the slot is cleared and the
  // deferred send is skipped; when xterm drops it the slot survives the macro
  // task and we send it once. The defer is one tick (~0ms), so input stays
  // fluid while no character is lost or duplicated.
  private handleCompositionEnd(event: CompositionEvent): void {
    const data = event.data;
    // WebKitGTK never flushes the composed text out of xterm's helper textarea
    // after a dead key, so the character lingers there. The next keystroke makes
    // xterm read the whole stale buffer through onData, delivering ~, then ~~,
    // then ~~~ … — the input grows on every press. Clear the textarea here so
    // each composition starts empty and nothing can accumulate. (Runs after
    // xterm's own compositionend listener, so its deferred read finds it empty
    // and does not double-send.)
    if (this.term.textarea) this.term.textarea.value = "";
    if (!data) return;
    this.pendingComposition = data;
    window.setTimeout(() => {
      if (this.pendingComposition !== data) return;
      this.pendingComposition = null;
      if (this.generation) ptyWrite(this.generation, data).catch(() => {});
    }, 0);
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
