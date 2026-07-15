// Dead-key/IME input owner for WebKit webviews (WebKitGTK on Linux).
//
// xterm's composition pipeline reads composed text out of its hidden helper
// <textarea> with substring() calls inside setTimeout(0) callbacks, and only
// clears that buffer on Enter/Ctrl-C. Under WebKitGTK every committed
// character stays in the buffer, so each new dead-key composition re-reads
// and re-sends the accumulated text: "~", "~~", "~~~", … (pt-BR layouts hit
// this constantly — ~, ´, ^ are dead keys there).
//
// Patching around that timing (deferred re-sends, deduping against onData)
// proved racy, so this module takes exclusive ownership of composed text:
//
// - Listeners are registered in the capture phase on an ANCESTOR of the
//   textarea. At the target element the DOM dispatches capture and bubble
//   listeners in registration order — xterm registers first, so listening on
//   the textarea itself cannot preempt it. Ancestor capture always runs
//   before any target listener, so stopPropagation() here makes xterm blind
//   to the whole composition path.
// - keydown events owned by the IME (isComposing / keyCode 229) are also
//   hidden: xterm's 229 fallback diffs the textarea value, and with the
//   buffer kept empty that diff would emit a spurious DEL.
// - Committed text is read synchronously from the textarea — the browser has
//   already inserted it when `input`/`compositionend` fire — handed to
//   `commit` exactly once, and the buffer is emptied so nothing accumulates.
//   No timers, so no added latency and no reordering against keys (e.g. an
//   Enter right after a composed character) that xterm sends directly.
//
// Ordinary keystrokes never reach this module: xterm cancels their
// keydown/keypress before the browser inserts anything, so `input` only ever
// fires for text xterm chose not to handle (dead keys, IME, the keystroke
// after an unprocessed dead key).
export class CompositionCapture {
  private composing = false;
  private readonly listeners: Array<[string, (ev: Event) => void]>;

  constructor(
    private readonly root: HTMLElement,
    private readonly textarea: HTMLTextAreaElement,
    private readonly commit: (data: string) => void
  ) {
    this.listeners = [
      ["keydown", (ev) => this.onKeyDown(ev as KeyboardEvent)],
      ["compositionstart", (ev) => this.onCompositionStart(ev)],
      ["compositionupdate", (ev) => this.onCompositionUpdate(ev)],
      ["compositionend", (ev) => this.onCompositionEnd(ev)],
      ["input", (ev) => this.onInput(ev)],
    ];
    for (const [type, listener] of this.listeners) {
      root.addEventListener(type, listener, true);
    }
  }

  dispose(): void {
    for (const [type, listener] of this.listeners) {
      this.root.removeEventListener(type, listener, true);
    }
  }

  private owns(ev: Event): boolean {
    return ev.target === this.textarea;
  }

  private onKeyDown(ev: KeyboardEvent): void {
    if (!this.owns(ev)) return;
    // No preventDefault: the IM must still see the key to keep composing.
    if (ev.isComposing || ev.keyCode === 229) ev.stopPropagation();
  }

  private onCompositionStart(ev: Event): void {
    if (!this.owns(ev)) return;
    ev.stopPropagation();
    this.composing = true;
  }

  private onCompositionUpdate(ev: Event): void {
    if (!this.owns(ev)) return;
    ev.stopPropagation();
  }

  private onCompositionEnd(ev: Event): void {
    if (!this.owns(ev)) return;
    ev.stopPropagation();
    this.composing = false;
    // Engines that insert the committed text before compositionend are
    // drained here; the rest insert right after and are drained by onInput.
    this.drain();
  }

  private onInput(ev: Event): void {
    if (!this.owns(ev)) return;
    ev.stopPropagation();
    // In-progress composition text is provisional (the IM keeps replacing it
    // in the textarea); only committed text may be sent.
    if (this.composing) return;
    this.drain();
  }

  private drain(): void {
    const text = this.textarea.value;
    if (!text) return;
    this.textarea.value = "";
    this.commit(text);
  }
}

// WebView2 (Windows) is Chromium-based and its UA carries "Chrome/"; xterm's
// stock composition path works there, so the takeover stays WebKit-only.
export function needsCompositionCapture(userAgent: string): boolean {
  return userAgent.includes("AppleWebKit") && !userAgent.includes("Chrome");
}
