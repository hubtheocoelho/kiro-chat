# Kiro Chat — instalador amigável do Kiro CLI para Windows

Instale o [Kiro CLI](https://kiro.dev/docs/cli/) em poucos cliques e converse com o Kiro numa janela bonita e simples — sem precisar saber o que é um terminal.

O **Kiro Chat** é um aplicativo desktop (Tauri 2) que embute um **terminal de verdade** (ConPTY + xterm.js). O `kiro-cli` roda dentro dele como um processo normal do seu usuário, com **os mesmos acessos de quando é aberto num terminal tradicional**: pode ler e modificar arquivos e executar comandos na sua máquina, exatamente como o Kiro precisa.

> Projeto comunitário, **não oficial** — não é afiliado à AWS nem ao time do Kiro.

## Para usuários

### Requisitos

- Windows 11 (64 bits) — requisito do próprio Kiro CLI
- Conexão com a internet

### Instalação (2 cliques)

1. Baixe o `Kiro Chat_x.y.z_x64-setup.exe` na página de [Releases](../../releases).
2. Execute o instalador. Como o executável ainda não é assinado digitalmente, o Windows SmartScreen pode mostrar um aviso: clique em **"Mais informações" → "Executar assim mesmo"**.
3. Pronto. O instalador não pede permissão de administrador, cria o ícone **Kiro Chat** na área de trabalho e abre o app ao concluir.

### Primeira execução (automática)

Ao abrir pela primeira vez, o app prepara tudo sozinho:

1. **Verifica o sistema** (Windows 11 64 bits e conexão);
2. **Baixa e instala o Kiro CLI** usando o instalador oficial (`cli.kiro.dev`), com progresso na tela — e ajusta o PATH para o `kiro-cli` funcionar também em qualquer terminal;
3. **Conecta sua conta**: o navegador abre para login com AWS Builder ID, Google ou GitHub (grátis);
4. **Abre o chat** automaticamente.

Nas próximas vezes, o duplo clique no ícone vai direto para o chat. A cada abertura o app re-verifica as dependências e se auto-corrige se algo sumir.

### Uso

- **Nova conversa** reinicia o chat.
- **📁 Pasta de trabalho** escolhe a pasta na qual o Kiro vai trabalhar (ler/editar arquivos).
- **🌙/☀️** alterna tema escuro/claro; **?** abre a documentação.
- Menu Iniciar → **Kiro CLI (Terminal)** abre o `kiro-cli` num PowerShell tradicional, para quem preferir o jeito clássico.

### Desinstalação

Configurações → Aplicativos → **Kiro Chat** → Desinstalar. (O Kiro CLI em si é independente e permanece instalado; remova-o seguindo a [documentação oficial](https://kiro.dev/docs/cli/installation/).)

## Para desenvolvedores

### Stack

- **App**: Tauri 2 (Rust) + Vite + TypeScript puro + xterm.js 5
- **PTY**: [`portable-pty`](https://crates.io/crates/portable-pty) (ConPTY no Windows)
- **Instalador**: bundler NSIS do Tauri — per-user (sem UAC), idiomas pt-BR/en, atalho na área de trabalho, bootstrap do WebView2

### Pré-requisitos

- Node.js 22+, Rust estável
- Linux (dev): `libwebkit2gtk-4.1-dev libgtk-3-dev pkg-config libssl-dev`

### Comandos

```bash
npm install            # dependências
npm run tauri dev      # app em modo dev (no Linux abre com um shell de testes)
npm run typecheck      # TypeScript
cargo test  --manifest-path src-tauri/Cargo.toml   # testes Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run build && npm run tauri build               # gera o setup .exe (no Windows)
npm run icons          # regenera os ícones (script sem dependências)
```

O build de release acontece no GitHub Actions (`windows-latest`); o artefato NSIS sai em `src-tauri/target/release/bundle/nsis/`.

### Estrutura

```
src/                  frontend (boot → wizard → terminal)
src-tauri/src/
  pty.rs              sessões ConPTY/PTY + eventos pty://output|exit
  kiro.rs             localizar/instalar/autenticar o kiro-cli
  deps.rs             checagens de sistema (Win11, arch, online)
  path_env.rs         PATH persistente do usuário (HKCU)
  config.rs           preferências em %APPDATA%/.../config.json
src-tauri/installer-hooks.nsh   atalho extra "Kiro CLI (Terminal)"
```

### Convenção de commits (QAC)

Este repositório segue a spec [QAC — Qualified Agent Commits](https://github.com/hubtheocoelho/qac-spec): commits de agentes de IA levam os trailers `Agent`, `Mode`, `What`, `Why`. Após clonar, ative o hook de validação:

```bash
git config core.hooksPath .githooks
```

## Licença

[MIT](LICENSE)
