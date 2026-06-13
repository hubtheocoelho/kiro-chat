# Kiro Chat

> A cross-platform desktop app that installs, authenticates, and runs the official
> Kiro CLI inside a chat-style terminal — no manual setup, no admin rights.

Built for people who want the Kiro CLI without touching a terminal: download one
installer, and the app handles installation, login, and updates on first launch.

![release](https://img.shields.io/github/v/release/hubtheocoelho/kiro-chat?label=release)
![license](https://img.shields.io/github/license/hubtheocoelho/kiro-chat)
![platform](https://img.shields.io/badge/platform-Windows%2011%20%7C%20Ubuntu%2022.04%2B-blue)

## ✨ Features

- **Two-click install** — per-user NSIS installer on Windows 11 (no UAC prompt).
- **Automatic CLI setup** — downloads and installs the official Kiro CLI on first run.
- **Guided sign-in** — opens the browser for AWS Builder ID, Google, or GitHub login.
- **Real terminal** — runs `kiro-cli chat` over a true PTY (ConPTY / openpty) via xterm.js.
- **Concurrent tabs** — browser-style tabs, each with its own session and workspace folder.
- **Workspace picker** — choose the folder Kiro reads and edits.
- **Light & dark themes** — toggle from the top bar.
- **Bilingual UI** — Portuguese (pt-BR) and English, selected by system language.
- **PATH integration** — makes `kiro-cli` available in other terminals after install.

## 🧰 Tech Stack

- **Frontend:** TypeScript, Vite, xterm.js (no UI framework — plain DOM)
- **Backend:** Rust, Tauri 2
- **Terminal:** `portable-pty` (ConPTY on Windows, openpty on Linux)
- **Packaging:** NSIS (Windows), deb + AppImage (Linux)

## ⚡ Quick Start

### Prerequisites

- Windows 11 (64-bit), or Linux x86_64 (Ubuntu 22.04+ / glibc 2.35+)
- An internet connection (to download the Kiro CLI on first run)

### Install (Windows)

1. Download `Kiro Chat_x.y.z_x64-setup.exe` from the [Releases](../../releases) page.
2. Run it. If SmartScreen warns about an unsigned app, choose
   **More info → Run anyway**.
3. The installer creates a desktop shortcut and launches the app.

### Install (Linux)

Download the `.deb` (Ubuntu/Debian) or `.AppImage` (any distro) from
[Releases](../../releases), then:

```bash
# Option A — Debian/Ubuntu package
sudo apt install ./Kiro.Chat_x.y.z_amd64.deb

# Option B — AppImage (any distro with glibc 2.35+)
chmod +x Kiro.Chat_x.y.z_amd64.AppImage
./Kiro.Chat_x.y.z_amd64.AppImage
```

### Build from source

```bash
git clone https://github.com/hubtheocoelho/kiro-chat.git
cd kiro-chat
npm install
npm run tauri dev
```

Source builds need **Node.js 22+** and **Rust stable**. On Linux, also install:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev pkg-config libssl-dev
```

## 📖 Usage

On first launch the app sets itself up automatically:

1. Checks the OS and connectivity.
2. Downloads and installs the official Kiro CLI, then updates your PATH.
3. Opens the browser for account sign-in.
4. Opens the chat terminal. Later launches re-check and auto-repair as needed.

Once running, use the top bar to:

- **New tab (`+`)** — start another concurrent Kiro session.
- **Folder (📁)** — choose the workspace folder Kiro will work in.
- **Theme (🌙 / ☀️)** — switch between dark and light.
- **Help (?)** — open the Kiro CLI documentation.

On Windows, a Start Menu shortcut **Kiro CLI (Terminal)** opens `kiro-cli` in a
classic PowerShell window.

Common development commands:

```bash
npm run typecheck                                          # tsc --noEmit
npm run build                                              # tsc + vite build → dist/
npm run tauri build                                        # build installers for the host OS
cargo test  --manifest-path src-tauri/Cargo.toml          # Rust tests
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## 🗂 Project Structure

```text
kiro-chat/
├── src/              # Frontend (TypeScript, plain DOM + xterm.js)
├── src-tauri/
│   ├── src/          # Backend (Rust): pty, kiro, deps, config, path_env, proc
│   └── *.conf.json   # Tauri config (base + Linux overrides)
├── scripts/          # Build helpers (icon generation, version sync)
├── docs/             # Architecture & contributor documentation
└── .github/          # CI and release workflows
```

For a deeper map, start at [CLAUDE.md](CLAUDE.md) and the [docs/](docs) folder.

## 🤝 Contributing

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Run the checks before pushing: `npm run typecheck`, `cargo clippy … -D warnings`,
   and `cargo test` (clippy warnings fail CI).
3. Use conventional commit types (`feat:`, `fix:`, `docs:`). Commits made by AI
   agents must also carry QAC trailers — enable the hook with
   `git config core.hooksPath .githooks`.
4. Keep [docs/](docs) in sync with your change, then open a Pull Request.

## 📄 License

MIT — see [LICENSE](LICENSE).

Disclaimer: community project, not official or affiliated with AWS or the Kiro team.
