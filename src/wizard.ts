import { openUrl } from "@tauri-apps/plugin-opener";

import { t } from "./i18n";
import { checkSystem, installKiro, onInstallProgress, type KiroInfo } from "./ipc";
import { actionButtons, type ActionSpec } from "./ui";

type StepId = "system" | "install" | "login";
type StepState = "pending" | "active" | "done" | "error";

const MANUAL_INSTALL_COMMAND = "irm 'https://cli.kiro.dev/install.ps1' | iex";

export class SetupWizard {
  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="setup-card">
        <div class="setup-logo">❯_</div>
        <h1 class="setup-title">${t.setupTitle}</h1>
        <p class="setup-subtitle">${t.setupSubtitle}</p>
        <ol class="steps">
          <li data-step="system" data-state="active"><span class="step-marker"></span>${t.stepSystem}</li>
          <li data-step="install" data-state="pending"><span class="step-marker"></span>${t.stepInstall}</li>
          <li data-step="login" data-state="pending"><span class="step-marker"></span>${t.stepLogin}</li>
        </ol>
        <p class="setup-status"></p>
        <details class="setup-log hidden">
          <summary>${t.detailsLabel}</summary>
          <pre></pre>
        </details>
        <div class="setup-actions"></div>
      </div>
    `;
  }

  markStep(step: StepId, state: StepState): void {
    const li = this.root.querySelector<HTMLElement>(`li[data-step="${step}"]`);
    if (li) li.dataset.state = state;
  }

  private status(text: string, kind: "info" | "error" = "info"): void {
    const el = this.root.querySelector<HTMLElement>(".setup-status")!;
    el.textContent = text;
    el.classList.toggle("error", kind === "error");
  }

  private actions(buttons: ActionSpec[]): void {
    const host = this.root.querySelector<HTMLElement>(".setup-actions")!;
    host.replaceChildren(...actionButtons(buttons));
  }

  private appendLog(line: string): void {
    const wrap = this.root.querySelector<HTMLElement>(".setup-log")!;
    wrap.classList.remove("hidden");
    const pre = wrap.querySelector("pre")!;
    pre.textContent += (pre.textContent ? "\n" : "") + line;
    pre.scrollTop = pre.scrollHeight;
  }

  async systemWarning(): Promise<void> {
    this.markStep("system", "error");
    this.status(t.sysWarnBody, "error");
    await new Promise<void>((resolve) =>
      this.actions([
        { label: t.continueAnyway, primary: true, onClick: () => resolve() },
        {
          label: t.learnMore,
          onClick: () => void openUrl("https://kiro.dev/docs/cli/installation/"),
        },
      ])
    );
    this.actions([]);
    this.status("");
    this.markStep("system", "active");
  }

  async waitOnline(): Promise<void> {
    for (;;) {
      this.markStep("system", "error");
      this.status(t.offlineBody, "error");
      await new Promise<void>((resolve) =>
        this.actions([{ label: t.retry, primary: true, onClick: () => resolve() }])
      );
      this.actions([]);
      this.status(t.checking);
      const sys = await checkSystem().catch(() => null);
      if (!sys || sys.online) {
        this.status("");
        this.markStep("system", "active");
        return;
      }
    }
  }

  async runInstall(): Promise<KiroInfo> {
    const unlisten = await onInstallProgress((line) => this.appendLog(line));
    try {
      for (;;) {
        this.markStep("install", "active");
        this.status(t.installing);
        try {
          const info = await installKiro();
          this.markStep("install", "done");
          this.status("");
          return info;
        } catch (err) {
          this.markStep("install", "error");
          this.appendLog(String(err));
          this.status(t.installFailed, "error");
          await new Promise<void>((resolve) =>
            this.actions([
              { label: t.retry, primary: true, onClick: () => resolve() },
              {
                label: t.copyCommand,
                onClick: (btn) => {
                  void navigator.clipboard.writeText(MANUAL_INSTALL_COMMAND);
                  btn.textContent = t.copied;
                },
              },
              {
                label: t.learnMore,
                onClick: () => void openUrl("https://kiro.dev/docs/cli/installation/"),
              },
            ])
          );
          this.actions([]);
        }
      }
    } finally {
      unlisten();
    }
  }

  async askLogin(): Promise<void> {
    this.markStep("login", "active");
    this.status(t.loginIntro);
    await new Promise<void>((resolve) =>
      this.actions([{ label: t.loginButton, primary: true, onClick: () => resolve() }])
    );
    this.actions([]);
  }
}
