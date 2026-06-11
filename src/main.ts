import "./styles.css";
import { TerminalView } from "./terminal";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <span class="brand-icon">❯_</span>
      <span class="brand-name">Kiro Chat</span>
    </div>
  </header>
  <main class="content">
    <div id="terminal" class="terminal-host"></div>
    <div id="overlay" class="overlay hidden">
      <div class="overlay-card">
        <p id="overlay-msg">Sessão encerrada.</p>
        <button id="overlay-restart" class="btn btn-primary">Reiniciar</button>
      </div>
    </div>
  </main>
`;

const overlay = document.getElementById("overlay")!;
const overlayMsg = document.getElementById("overlay-msg")!;
const view = new TerminalView(document.getElementById("terminal")!);

view.onExit = (code) => {
  overlayMsg.textContent = code === 0 ? "Sessão encerrada." : `Sessão encerrada (código ${code ?? "?"}).`;
  overlay.classList.remove("hidden");
};

document.getElementById("overlay-restart")!.addEventListener("click", () => {
  overlay.classList.add("hidden");
  void view.spawn("shell");
});

// Temporary dev bootstrap: spawns a plain shell. The first-run wizard will
// replace this with the kiro-cli chat flow.
void view.spawn("shell");
