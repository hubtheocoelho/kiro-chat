import "./styles.css";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

import { fmt, t } from "./i18n";
import { checkAuth, checkSystem, getConfig, locateKiro, setConfig, type AppConfig } from "./ipc";
import { TerminalView } from "./terminal";
import { applyCssTheme, type ThemeName } from "./theme";
import { SetupWizard } from "./wizard";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="screen-splash" class="screen splash">
    <div class="setup-logo">❯_</div>
    <p class="dim">${t.splash}</p>
    <div class="spinner"></div>
  </div>

  <div id="screen-setup" class="screen setup hidden"></div>

  <div id="screen-main" class="screen main hidden">
    <header class="topbar">
      <div class="brand">
        <span class="brand-icon">❯_</span>
        <span class="brand-name">${t.appName}</span>
        <span id="status-chip" class="status-chip">${t.statusDisconnected}</span>
      </div>
      <div class="topbar-actions">
        <button id="btn-new" class="btn">${t.newChat}</button>
        <button id="btn-folder" class="btn" title="${t.chooseFolderTip}">
          <span aria-hidden="true">📁</span> <span id="folder-name"></span>
        </button>
        <button id="btn-theme" class="btn btn-icon" title="${t.toggleTheme}">🌙</button>
        <button id="btn-help" class="btn btn-icon" title="${t.help}">?</button>
      </div>
    </header>
    <div id="banner" class="banner hidden">
      <span id="banner-text"></span>
      <span id="banner-actions" class="banner-actions"></span>
    </div>
    <main class="content">
      <div id="terminal" class="terminal-host"></div>
      <div id="overlay" class="overlay hidden">
        <div class="overlay-card">
          <p id="overlay-msg"></p>
          <button id="overlay-restart" class="btn btn-primary">${t.restart}</button>
        </div>
      </div>
    </main>
  </div>
`;

const byId = (id: string) => document.getElementById(id)!;
const screens = {
  splash: byId("screen-splash"),
  setup: byId("screen-setup"),
  main: byId("screen-main"),
};

function show(target: HTMLElement): void {
  for (const screen of Object.values(screens)) {
    screen.classList.toggle("hidden", screen !== target);
  }
}

let config: AppConfig = { kiroPath: null, theme: null, cwd: null };
let theme: ThemeName = "dark";
let view: TerminalView | null = null;
let exitWaiter: ((code: number | null) => void) | null = null;

function ensureView(): TerminalView {
  if (!view) {
    view = new TerminalView(byId("terminal"));
    view.setTheme(theme);
    view.onExit = (code) => {
      if (exitWaiter) {
        const resolve = exitWaiter;
        exitWaiter = null;
        resolve(code);
        return;
      }
      byId("overlay-msg").textContent =
        code === 0 ? t.sessionEnded : fmt(t.sessionEndedCode, { code: code ?? "?" });
      byId("overlay").classList.remove("hidden");
    };
  }
  return view;
}

const waitForExit = (): Promise<number | null> =>
  new Promise((resolve) => {
    exitWaiter = resolve;
  });

function setStatus(connected: boolean): void {
  const chip = byId("status-chip");
  chip.classList.toggle("ok", connected);
  chip.textContent = connected ? t.statusConnected : t.statusDisconnected;
}

interface BannerAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

function setBanner(text: string | null, kind: "info" | "error" = "info", actions: BannerAction[] = []): void {
  const banner = byId("banner");
  if (!text) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  banner.classList.toggle("error", kind === "error");
  byId("banner-text").textContent = text;
  byId("banner-actions").replaceChildren(
    ...actions.map((spec) => {
      const btn = document.createElement("button");
      btn.className = spec.primary ? "btn btn-primary" : "btn";
      btn.textContent = spec.label;
      btn.addEventListener("click", spec.onClick);
      return btn;
    })
  );
}

const bannerAsk = (text: string, labels: string[]): Promise<number> =>
  new Promise((resolve) =>
    setBanner(
      text,
      "error",
      labels.map((label, index) => ({ label, primary: index === 0, onClick: () => resolve(index) }))
    )
  );

function folderLabel(): string {
  if (!config.cwd) return t.folderDefault;
  const parts = config.cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? config.cwd;
}

const updateFolderLabel = (): void => {
  byId("folder-name").textContent = folderLabel();
};

async function spawnChat(): Promise<void> {
  ensureView();
  byId("overlay").classList.add("hidden");
  setBanner(null);
  try {
    await view!.spawn("chat", config.cwd);
  } catch (err) {
    const choice = await bannerAsk(`${t.chatStartFailed} ${String(err)}`, [t.retry, t.runSetupAgain]);
    setBanner(null);
    if (choice === 0) return spawnChat();
    location.reload();
  }
}

async function runLogin(): Promise<void> {
  ensureView();
  show(screens.main);
  setStatus(false);
  for (;;) {
    setBanner(t.loginWait);
    const exited = waitForExit();
    try {
      await view!.spawn("login");
    } catch (err) {
      const choice = await bannerAsk(`${t.chatStartFailed} ${String(err)}`, [t.retry, t.runSetupAgain]);
      setBanner(null);
      if (choice === 1) location.reload();
      continue;
    }
    await exited;
    const authed = await checkAuth().catch(() => false);
    if (authed) {
      setBanner(null);
      return;
    }
    await bannerAsk(t.loginFailed, [t.retry]);
    setBanner(null);
  }
}

async function boot(): Promise<void> {
  config = (await getConfig().catch(() => null)) ?? config;
  theme = config.theme === "light" ? "light" : "dark";
  applyCssTheme(theme);
  byId("btn-theme").textContent = theme === "dark" ? "🌙" : "☀️";
  updateFolderLabel();

  const wizard = new SetupWizard(screens.setup);

  const sys = await checkSystem().catch(() => null);
  if (sys && sys.os === "windows" && (!sys.win11 || !sys.archOk)) {
    show(screens.setup);
    await wizard.systemWarning();
  }
  if (sys && !sys.online) {
    show(screens.setup);
    await wizard.waitOnline();
  }
  wizard.markStep("system", "done");

  let info = await locateKiro().catch(() => null);
  if (!info) {
    show(screens.setup);
    info = await wizard.runInstall();
  }
  wizard.markStep("install", "done");

  const authed = await checkAuth().catch(() => false);
  if (!authed) {
    show(screens.setup);
    await wizard.askLogin();
    await runLogin();
    wizard.markStep("login", "done");
  }

  setStatus(true);
  show(screens.main);
  await spawnChat();
}

byId("overlay-restart").addEventListener("click", () => void spawnChat());

byId("btn-new").addEventListener("click", () => {
  if (view) void spawnChat();
});

byId("btn-folder").addEventListener("click", () => {
  void (async () => {
    const picked = await openFolderDialog({
      directory: true,
      defaultPath: config.cwd ?? undefined,
      title: t.chooseFolderTip,
    });
    if (typeof picked === "string" && picked) {
      config.cwd = picked;
      void setConfig(config);
      updateFolderLabel();
      void spawnChat();
    }
  })();
});

byId("btn-theme").addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  config.theme = theme;
  void setConfig(config);
  applyCssTheme(theme);
  view?.setTheme(theme);
  byId("btn-theme").textContent = theme === "dark" ? "🌙" : "☀️";
});

byId("btn-help").addEventListener("click", () => void openUrl("https://kiro.dev/docs/cli/"));

void boot();
