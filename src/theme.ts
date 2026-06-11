import type { ITheme } from "@xterm/xterm";

export type ThemeName = "dark" | "light";

export const xtermThemes: Record<ThemeName, ITheme> = {
  dark: {
    background: "#17141f",
    foreground: "#ece9f4",
    cursor: "#c4b5fd",
    cursorAccent: "#17141f",
    selectionBackground: "#7c3aed55",
    black: "#1e1b2e",
    red: "#f87171",
    green: "#34d399",
    yellow: "#fbbf24",
    blue: "#60a5fa",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#e5e1f0",
    brightBlack: "#6b6485",
    brightRed: "#fca5a5",
    brightGreen: "#6ee7b7",
    brightYellow: "#fde68a",
    brightBlue: "#93c5fd",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: "#ffffff",
  },
  light: {
    background: "#faf9fc",
    foreground: "#2a2438",
    cursor: "#7c3aed",
    cursorAccent: "#faf9fc",
    selectionBackground: "#7c3aed33",
    black: "#2a2438",
    red: "#dc2626",
    green: "#059669",
    yellow: "#d97706",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#e9e6f0",
    brightBlack: "#6f678a",
    brightRed: "#ef4444",
    brightGreen: "#10b981",
    brightYellow: "#f59e0b",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#1e1b2e",
  },
};

export function applyCssTheme(name: ThemeName): void {
  document.documentElement.dataset.theme = name;
}
