const ptBR = {
  appName: "Kiro Chat",
  splash: "Preparando o Kiro Chat…",

  setupTitle: "Bem-vindo ao Kiro Chat",
  setupSubtitle: "Vamos deixar tudo pronto automaticamente. Isso acontece só uma vez.",
  stepSystem: "Verificar o sistema",
  stepInstall: "Instalar o Kiro CLI",
  stepLogin: "Conectar sua conta",
  checking: "Verificando…",

  sysWarnBody:
    "O Kiro CLI precisa do Windows 11 (64 bits). Seu computador parece não atender a esse requisito, então a instalação pode falhar.",
  continueAnyway: "Continuar mesmo assim",
  learnMore: "Saiba mais",

  offlineBody: "Sem conexão com a internet. Conecte-se para continuar a preparação.",
  retry: "Tentar novamente",

  installing: "Baixando e instalando o Kiro CLI… isso pode levar alguns minutos.",
  installFailed:
    "Não foi possível instalar automaticamente. Verifique sua conexão e tente novamente — ou copie o comando manual e cole em uma janela do PowerShell.",
  copyCommand: "Copiar comando manual",
  copied: "Copiado!",
  detailsLabel: "Detalhes técnicos",

  loginIntro:
    "Falta só conectar sua conta (é grátis). Vamos abrir o navegador para você entrar com AWS Builder ID, Google ou GitHub.",
  loginButton: "Conectar minha conta",
  loginWait:
    "Finalize o login no navegador que abriu. Se o navegador não abrir, use o link e o código mostrados no terminal abaixo.",
  loginFailed: "O login não foi concluído. Vamos tentar de novo?",

  statusConnected: "Conectado",
  statusDisconnected: "Desconectado",
  newChat: "Nova conversa",
  newTab: "Nova aba",
  closeTab: "Fechar aba",
  chooseFolderTip: "Escolher a pasta em que o Kiro vai trabalhar",
  folderDefault: "Pasta pessoal",
  toggleTheme: "Alternar tema claro/escuro",
  help: "Ajuda",

  sessionEnded: "Sessão encerrada.",
  sessionEndedCode: "Sessão encerrada (código {code}).",
  restart: "Reiniciar",
  chatStartFailed: "Não foi possível iniciar o chat.",
  runSetupAgain: "Refazer configuração",
};

type Dict = typeof ptBR;

const en: Dict = {
  appName: "Kiro Chat",
  splash: "Getting Kiro Chat ready…",

  setupTitle: "Welcome to Kiro Chat",
  setupSubtitle: "We'll set everything up automatically. This only happens once.",
  stepSystem: "Check your system",
  stepInstall: "Install the Kiro CLI",
  stepLogin: "Connect your account",
  checking: "Checking…",

  sysWarnBody:
    "Kiro CLI requires Windows 11 (64-bit). Your computer doesn't seem to meet that requirement, so the installation may fail.",
  continueAnyway: "Continue anyway",
  learnMore: "Learn more",

  offlineBody: "No internet connection. Connect to continue the setup.",
  retry: "Try again",

  installing: "Downloading and installing the Kiro CLI… this can take a few minutes.",
  installFailed:
    "Automatic installation failed. Check your connection and try again — or copy the manual command and paste it into a PowerShell window.",
  copyCommand: "Copy manual command",
  copied: "Copied!",
  detailsLabel: "Technical details",

  loginIntro:
    "One last step: connect your account (it's free). We'll open your browser so you can sign in with AWS Builder ID, Google or GitHub.",
  loginButton: "Connect my account",
  loginWait:
    "Finish signing in using the browser window that just opened. If it didn't open, use the link and code shown in the terminal below.",
  loginFailed: "Sign-in didn't complete. Want to try again?",

  statusConnected: "Connected",
  statusDisconnected: "Disconnected",
  newChat: "New chat",
  newTab: "New tab",
  closeTab: "Close tab",
  chooseFolderTip: "Choose the folder Kiro will work in",
  folderDefault: "Home folder",
  toggleTheme: "Toggle light/dark theme",
  help: "Help",

  sessionEnded: "Session ended.",
  sessionEndedCode: "Session ended (code {code}).",
  restart: "Restart",
  chatStartFailed: "Could not start the chat.",
  runSetupAgain: "Run setup again",
};

export const t: Dict = navigator.language?.toLowerCase().startsWith("pt") ? ptBR : en;

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => String(vars[key] ?? ""));
}
