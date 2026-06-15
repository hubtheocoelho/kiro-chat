import "./styles.css";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { fmt, t } from "./i18n";
import { checkAuth, checkSystem, getConfig, locateKiro, setConfig, type AppConfig } from "./ipc";
import { TerminalView } from "./terminal";
import { applyCssTheme, type ThemeName } from "./theme";
import { actionButtons, type ActionSpec } from "./ui";
import { SetupWizard } from "./wizard";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="screen-splash" class="screen splash" data-tauri-drag-region>
    <div class="setup-logo">❯_</div>
    <p class="dim">${t.splash}</p>
    <div class="spinner"></div>
  </div>

  <div id="screen-setup" class="screen setup hidden" data-tauri-drag-region></div>

  <div id="screen-main" class="screen main hidden">
    <header class="topbar" data-tauri-drag-region>
      <div class="brand">
        <span class="brand-icon">❯_</span>
        <span class="brand-name">${t.appName}</span>
        <span id="status-chip" class="status-chip">${t.statusDisconnected}</span>
      </div>
      <div class="topbar-actions">
        <button id="btn-folder" class="btn" title="${t.chooseFolderTip}">
          <span aria-hidden="true">📁</span> <span id="folder-name"></span>
        </button>
        <button id="btn-theme" class="btn btn-icon" title="${t.toggleTheme}">🌙</button>
        <button id="btn-help" class="btn btn-icon" title="${t.help}">?</button>
      </div>
      <div class="window-controls">
        <button id="btn-win-min" class="win-btn" title="${t.minimizeWindow}" aria-label="${t.minimizeWindow}">─</button>
        <button id="btn-win-max" class="win-btn" title="${t.maximizeWindow}" aria-label="${t.maximizeWindow}">▢</button>
        <button id="btn-win-close" class="win-btn win-btn-close" title="${t.closeWindow}" aria-label="${t.closeWindow}">✕</button>
      </div>
    </header>
    <div class="tabbar">
      <div id="tabs" class="tabs" role="tablist"></div>
      <button id="btn-add-tab" class="tab-add" title="${t.newTab}">+</button>
    </div>
    <div id="banner" class="banner hidden">
      <span id="banner-text"></span>
      <span id="banner-actions" class="banner-actions"></span>
    </div>
    <main class="content">
      <div id="panes" class="panes"></div>
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

function setStatus(connected: boolean): void {
  const chip = byId("status-chip");
  chip.classList.toggle("ok", connected);
  chip.textContent = connected ? t.statusConnected : t.statusDisconnected;
}

type BannerAction = ActionSpec;

function setBanner(text: string | null, kind: "info" | "error" = "info", actions: BannerAction[] = []): void {
  const banner = byId("banner");
  if (!text) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  banner.classList.toggle("error", kind === "error");
  byId("banner-text").textContent = text;
  byId("banner-actions").replaceChildren(...actionButtons(actions));
}

const bannerAsk = (text: string, labels: string[]): Promise<number> =>
  new Promise((resolve) =>
    setBanner(
      text,
      "error",
      labels.map((label, index) => ({ label, primary: index === 0, onClick: () => resolve(index) }))
    )
  );

function folderTitle(cwd: string | null): string {
  if (!cwd) return t.folderDefault;
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

const updateFolderLabel = (): void => {
  byId("folder-name").textContent = folderTitle(config.cwd);
};

const updateThemeButton = (): void => {
  byId("btn-theme").textContent = theme === "dark" ? "🌙" : "☀️";
};

/* ------------------------------------------------------------------- tabs */

interface Tab {
  id: number;
  cwd: string | null;
  view: TerminalView;
  tabEl: HTMLElement;
  pane: HTMLElement;
  overlay: HTMLElement;
  overlayMsg: HTMLElement;
  overlayFocus: HTMLElement;
}

let tabs: Tab[] = [];
let activeTabId = 0;
let nextTabId = 1;

function activateTab(id: number): void {
  activeTabId = id;
  for (const tab of tabs) {
    const active = tab.id === id;
    tab.tabEl.classList.toggle("active", active);
    tab.tabEl.setAttribute("aria-selected", String(active));
    tab.pane.classList.toggle("hidden", !active);
    if (active) {
      tab.view.fitNow();
      // If this tab's session ended, its modal owns input — don't pull focus
      // back into the terminal sitting behind the overlay.
      if (tab.overlay.classList.contains("hidden")) tab.view.focus();
      else tab.overlayFocus.focus();
    }
  }
}

function closeTab(id: number): void {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  tab.view.dispose();
  tab.tabEl.remove();
  tab.pane.remove();
  if (tabs.length === 0) {
    newTab(config.cwd);
    return;
  }
  if (activeTabId === id) {
    activateTab(tabs[Math.min(index, tabs.length - 1)].id);
  }
}

function newTab(cwd: string | null, autoSpawn = true): Tab {
  const id = nextTabId++;

  const tabEl = document.createElement("div");
  tabEl.className = "tab";
  tabEl.setAttribute("role", "tab");
  const titleEl = document.createElement("span");
  titleEl.className = "tab-title";
  titleEl.textContent = folderTitle(cwd);
  titleEl.title = cwd ?? t.folderDefault;
  const closeEl = document.createElement("button");
  closeEl.className = "tab-close";
  closeEl.title = t.closeTab;
  closeEl.textContent = "×";
  tabEl.append(titleEl, closeEl);
  byId("tabs").appendChild(tabEl);

  const pane = document.createElement("div");
  pane.className = "pane";
  const host = document.createElement("div");
  host.className = "terminal-host";
  const overlay = document.createElement("div");
  overlay.className = "overlay hidden";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const overlayCard = document.createElement("div");
  overlayCard.className = "overlay-card";
  const overlayMsg = document.createElement("p");
  overlayMsg.id = `overlay-msg-${id}`;
  overlay.setAttribute("aria-labelledby", overlayMsg.id);
  const overlayActions = document.createElement("div");
  overlayActions.className = "overlay-actions";
  const restartBtn = document.createElement("button");
  restartBtn.className = "btn btn-primary";
  restartBtn.textContent = t.restart;
  const closeTabBtn = document.createElement("button");
  closeTabBtn.className = "btn";
  closeTabBtn.textContent = t.closeTab;
  overlayActions.append(restartBtn, closeTabBtn);
  overlayCard.append(overlayMsg, overlayActions);
  overlay.appendChild(overlayCard);
  pane.append(host, overlay);
  byId("panes").appendChild(pane);

  const view = new TerminalView(host);
  view.setTheme(theme);

  const tab: Tab = { id, cwd, view, tabEl, pane, overlay, overlayMsg, overlayFocus: restartBtn };
  view.onExit = (code) => {
    overlayMsg.textContent =
      code === 0 ? t.sessionEnded : fmt(t.sessionEndedCode, { code: code ?? "?" });
    showOverlay(tab);
  };

  tabEl.addEventListener("click", () => activateTab(id));
  closeEl.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(id);
  });
  restartBtn.addEventListener("click", () => void spawnChat(tab));
  closeTabBtn.addEventListener("click", () => closeTab(id));
  // Trap Tab within the dialog so focus can't fall back into the blurred
  // terminal behind it.
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const order = [restartBtn, closeTabBtn];
    const dir = e.shiftKey ? -1 : 1;
    const here = order.indexOf(document.activeElement as HTMLButtonElement);
    order[(here + dir + order.length) % order.length].focus();
  });
  // Clicking the dimmed backdrop must not blur the dialog (which would hand
  // focus back to the terminal).
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) e.preventDefault();
  });

  tabs.push(tab);
  activateTab(id);
  if (autoSpawn) void spawnChat(tab);
  return tab;
}

// The exit overlay is a modal: while shown it must own mouse and keyboard
// input. Showing it blocks the terminal behind it and moves focus to the
// primary action; hiding it returns input to the terminal.
function showOverlay(tab: Tab): void {
  tab.view.setInputEnabled(false);
  tab.overlay.classList.remove("hidden");
  tab.overlayFocus.focus();
}

function hideOverlay(tab: Tab): void {
  tab.overlay.classList.add("hidden");
  tab.view.setInputEnabled(true);
}

/* --------------------------------------------------------------- sessions */

async function spawnChat(tab: Tab): Promise<void> {
  hideOverlay(tab);
  setBanner(null);
  try {
    await tab.view.spawn("chat", tab.cwd);
  } catch (err) {
    const choice = await bannerAsk(`${t.chatStartFailed} ${String(err)}`, [t.retry, t.runSetupAgain]);
    setBanner(null);
    if (choice === 0) return spawnChat(tab);
    location.reload();
  }
}

async function runLogin(tab: Tab): Promise<void> {
  show(screens.main);
  setStatus(false);
  const defaultExit = tab.view.onExit;
  // Resolves true when the user prefers restarting the whole setup.
  const askRetryOrReset = async (message: string): Promise<boolean> => {
    const choice = await bannerAsk(message, [t.retry, t.runSetupAgain]);
    setBanner(null);
    return choice === 1;
  };
  try {
    for (;;) {
      setBanner(t.loginWait);
      const exited = new Promise<number | null>((resolve) => {
        tab.view.onExit = resolve;
      });
      try {
        await tab.view.spawn("login");
      } catch (err) {
        if (await askRetryOrReset(`${t.chatStartFailed} ${String(err)}`)) {
          location.reload();
          return;
        }
        continue;
      }
      await exited;
      const authed = await checkAuth().catch(() => false);
      if (authed) {
        setBanner(null);
        return;
      }
      if (await askRetryOrReset(t.loginFailed)) {
        location.reload();
        return;
      }
    }
  } finally {
    tab.view.onExit = defaultExit;
  }
}

async function boot(): Promise<void> {
  config = (await getConfig().catch(() => null)) ?? config;
  theme = config.theme === "light" ? "light" : "dark";
  applyCssTheme(theme);
  updateThemeButton();
  updateFolderLabel();

  const wizard = new SetupWizard(screens.setup);

  // Independent probes; locating the binary must not wait for the network.
  const [sys, located] = await Promise.all([
    checkSystem().catch(() => null),
    locateKiro().catch(() => null),
  ]);
  if (sys && sys.os === "windows" && (!sys.win11 || !sys.archOk)) {
    show(screens.setup);
    await wizard.systemWarning();
  }
  if (sys && !sys.online) {
    show(screens.setup);
    await wizard.waitOnline();
  }
  wizard.markStep("system", "done");

  let info = located;
  if (!info) {
    show(screens.setup);
    info = await wizard.runInstall();
  }
  wizard.markStep("install", "done");

  const authed = await checkAuth().catch(() => false);
  if (!authed) {
    show(screens.setup);
    await wizard.askLogin();
    show(screens.main);
    const tab = newTab(config.cwd, false);
    await runLogin(tab);
    wizard.markStep("login", "done");
    setStatus(true);
    await spawnChat(tab);
    return;
  }

  setStatus(true);
  show(screens.main);
  newTab(config.cwd);
}

byId("btn-add-tab").addEventListener("click", () => {
  newTab(config.cwd);
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
      newTab(picked);
    }
  })();
});

byId("btn-theme").addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  config.theme = theme;
  void setConfig(config);
  applyCssTheme(theme);
  for (const tab of tabs) tab.view.setTheme(theme);
  updateThemeButton();
});

byId("btn-help").addEventListener("click", () => void openUrl("https://kiro.dev/docs/cli/"));

/* -------------------------------------------------------- window controls */

// Custom titlebar: the native frame is disabled (decorations: false), so the
// minimize/maximize/close buttons must drive the window over IPC ourselves.
const appWindow = getCurrentWindow();

const updateMaxButton = (maximized: boolean): void => {
  const btn = byId("btn-win-max");
  btn.textContent = maximized ? "❐" : "▢";
  const tip = maximized ? t.restoreWindow : t.maximizeWindow;
  btn.title = tip;
  btn.setAttribute("aria-label", tip);
};

byId("btn-win-min").addEventListener("click", () => void appWindow.minimize());
byId("btn-win-max").addEventListener("click", () => void appWindow.toggleMaximize());
byId("btn-win-close").addEventListener("click", () => void appWindow.close());

void appWindow.isMaximized().then(updateMaxButton);
void appWindow.onResized(() => void appWindow.isMaximized().then(updateMaxButton));

void boot();
