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
  ptyResize,
  ptySpawn,
  ptyWrite,
  type SpawnMode,
} from "./ipc";
import { xtermThemes, type ThemeName } from "./theme";

export class TerminalView {
  readonly term: Terminal;
  onExit: (code: number | null) => void = () => {};

  private fit = new FitAddon();
  private generation = 0;
  private resizeTimer: number | undefined;

  constructor(container: HTMLElement) {
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
      ptyWrite(data).catch(() => {});
    });
    new ResizeObserver(() => this.scheduleResize()).observe(container);

    void onPtyOutput((p) => {
      if (p.gen === this.generation) this.term.write(b64ToBytes(p.data));
    });
    void onPtyExit((p) => {
      if (p.gen === this.generation) this.onExit(p.code);
    });
  }

  async spawn(mode: SpawnMode, cwd: string | null = null): Promise<void> {
    this.term.reset();
    this.fit.fit();
    this.generation = await ptySpawn(mode, cwd, this.term.cols, this.term.rows);
    this.term.focus();
  }

  setTheme(name: ThemeName): void {
    this.term.options.theme = xtermThemes[name];
  }

  focus(): void {
    this.term.focus();
  }

  private scheduleResize(): void {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      const cols = this.term.cols;
      const rows = this.term.rows;
      this.fit.fit();
      if (this.term.cols !== cols || this.term.rows !== rows) {
        ptyResize(this.term.cols, this.term.rows).catch(() => {});
      }
    }, 50);
  }
}
