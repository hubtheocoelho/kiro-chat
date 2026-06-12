<!--
meta-description: Kiro Chat installer for Windows — official Kiro CLI two‑click installer that automatically downloads, installs and authenticates the Kiro CLI for Windows 11 (per-user, no UAC). Download the Kiro CLI installer (NSIS) with ConPTY + xterm.js integrated.
meta-keywords: kiro, kiro-cli, kiro cli installer, Kiro Chat installer, Kiro CLI Windows installer, install kiro-cli, kiro installer nsis, tauri, conpty, xterm.js, windows 11, per-user installer, two-click installer
-->

# Kiro Chat — Kiro CLI Installer for Windows (English, SEO optimized)

![release](https://img.shields.io/github/v/release/hubtheocoelho/kiro-cli-installer?label=release) ![license](https://img.shields.io/github/license/hubtheocoelho/kiro-cli-installer) ![platform](https://img.shields.io/badge/platform-Windows%2011-blue)

Quick summary: Download the Kiro Chat two‑click installer for Windows to automatically install, authenticate and run the official Kiro CLI inside a desktop chat terminal. Per‑user NSIS installer (no UAC). Ideal search keywords: "Kiro CLI installer", "install kiro-cli Windows", "Kiro Chat installer".

Table of contents
- [What this is](#what-this-is)
- [Top SEO keywords](#top-seo-keywords)
- [Why use this installer](#why-use-this-installer)
- [Requirements](#requirements)
- [Install in 2 clicks](#install-in-2-clicks)
- [First run behavior](#first-run-behavior)
- [How to use](#how-to-use)
- [Developer notes](#developer-notes)
- [Releases & downloads](#releases--downloads)
- [SEO & discoverability checklist](#seo--discoverability-checklist)
- [License & disclaimer](#license--disclaimer)

What this is
---
Kiro Chat is a Windows installer and desktop wrapper that makes Kiro CLI accessible without using a terminal. The installer automatically downloads the official Kiro CLI (from cli.kiro.dev), installs it for the current user, updates the user PATH, and opens a chat-style desktop app where `kiro-cli` runs inside a real terminal (ConPTY + xterm.js).

Top SEO keywords (use these in release notes and site metadata)
---
- Kiro CLI installer
- Kiro CLI Windows installer
- install kiro-cli
- Kiro Chat installer
- Kiro CLI per-user installer
- Kiro CLI no UAC
- Kiro CLI NSIS installer
- Kiro CLI Tauri ConPTY xterm.js

Why use this installer
---
- Two-click, per-user NSIS installer: installs without requiring administrator privileges (no UAC prompt).
- Automatic download & install of the official Kiro CLI with progress and verification.
- Integrates a real Windows PTY (ConPTY) and xterm.js so the CLI runs as a normal user process inside a chat UI.
- Provides authentication flow (AWS Builder ID, Google, GitHub) and updates PATH so `kiro-cli` is available in other terminals.

Requirements
---
- Windows 11 (64-bit) — required by the Kiro CLI
- Internet connection to download the Kiro CLI

Install in 2 clicks
---
1. Go to the [Releases](../../releases) page and download `Kiro Chat_x.y.z_x64-setup.exe`.
2. Run the EXE. If SmartScreen warns (unsigned executable), choose **More info → Run anyway**.
3. The installer creates a desktop shortcut and launches the app.

First run behavior
---
On first launch the app:
1. Validates OS and connectivity (Windows 11 x64 + online).
2. Downloads and installs the official Kiro CLI (`cli.kiro.dev`) and updates the user PATH.
3. Opens the browser for authentication (AWS Builder ID / Google / GitHub) and completes sign-in.
4. Opens the chat terminal automatically. Future launches re-check dependencies and auto-repair if needed.

How to use
---
- New conversation: start a fresh chat session.
- Workspace folder (📁): choose the folder where Kiro will read/edit files.
- Theme toggle (🌙/☀️): dark/light modes.
- Start classic terminal: use Start Menu → **Kiro CLI (Terminal)** to open `kiro-cli` in PowerShell.

Developer notes
---
Stack:
- Tauri 2 (Rust) + Vite + TypeScript + xterm.js
- PTY via `portable-pty` crate (ConPTY on Windows)
- NSIS bundler for per-user installer

Dev prerequisites:
- Node.js 22+
- Rust stable
- (Linux development) libwebkit2gtk-4.1-dev libgtk-3-dev pkg-config libssl-dev

Commands
---
```bash
npm install
npm run tauri dev
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run build && npm run tauri build  # generate .exe on Windows
```

Releases & downloads
---
Always download the latest Windows installer from the Releases page: ../../releases

SEO & discoverability checklist
---
Copy these into GitHub repo settings, release titles and descriptions, and any website/Pages metadata:
- Repo description: "Kiro Chat — Windows installer for Kiro CLI. Two-click NSIS installer that downloads and configures the official Kiro CLI (no UAC)."
- Release title example: "Kiro Chat — Kiro CLI Windows installer (no UAC) — vX.Y.Z"
- First line of release body: include: "Download the Kiro CLI installer for Windows — installs and authenticates the official Kiro CLI and makes `kiro-cli` available in PATH."
- GitHub topics to add: `kiro`, `kiro-cli`, `kiro-installer`, `installer`, `windows`, `nsis`, `tauri`, `conpty`, `xtermjs`, `cli`, `desktop-chat`
- README first 160 characters (meta-description above) — keep keyword phrase "Kiro CLI installer" within the first 50 characters if possible.
- Use the exact phrase "Kiro CLI installer" in the release name, tags and the README first paragraph.
- Add a screenshot + OG image to releases/GitHub Pages to improve social previews.

License & disclaimer
---
MIT — see [LICENSE](LICENSE).

Disclaimer: community project, not official or affiliated with AWS or the Kiro team.
