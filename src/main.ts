import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <span class="brand-icon">❯_</span>
      <span class="brand-name">Kiro Chat</span>
    </div>
  </header>
  <main class="content">
    <p class="placeholder">Carregando…</p>
  </main>
`;
