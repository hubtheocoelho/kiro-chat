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
import { CompositionCapture, needsCompositionCapture } from "./composition";

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
  private composition: CompositionCapture | null = null;

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
      if (this.generation) ptyWrite(this.generation, data).catch(() => {});
    });
    // open() created the helper textarea; on WebKitGTK, hand dead-key/IME
    // capture to CompositionCapture (see composition.ts for why xterm's own
    // path duplicates composed characters there).
    if (this.term.textarea && needsCompositionCapture(navigator.userAgent)) {
      this.composition = new CompositionCapture(container, this.term.textarea, (data) => {
        if (this.generation) ptyWrite(this.generation, data).catch(() => {});
      });
    }
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
    this.composition?.dispose();
    this.composition = null;
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
