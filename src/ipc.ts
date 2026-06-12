import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SpawnMode = "chat" | "login" | "shell";

export interface PtyOutput {
  gen: number;
  data: string;
}

export interface PtyExit {
  gen: number;
  code: number | null;
}

export const ptySpawn = (mode: SpawnMode, cwd: string | null, cols: number, rows: number) =>
  invoke<number>("pty_spawn", { mode, cwd, cols, rows });

export const ptyWrite = (generation: number, data: string) =>
  invoke<void>("pty_write", { generation, data });

export const ptyResize = (generation: number, cols: number, rows: number) =>
  invoke<void>("pty_resize", { generation, cols, rows });

export const ptyKill = (generation: number) => invoke<void>("pty_kill", { generation });

export const onPtyOutput = (cb: (p: PtyOutput) => void): Promise<UnlistenFn> =>
  listen<PtyOutput>("pty://output", (e) => cb(e.payload));

export const onPtyExit = (cb: (p: PtyExit) => void): Promise<UnlistenFn> =>
  listen<PtyExit>("pty://exit", (e) => cb(e.payload));

export interface KiroInfo {
  path: string;
  version: string | null;
}

export interface SystemReport {
  os: string;
  win11: boolean;
  archOk: boolean;
  online: boolean;
}

export interface AppConfig {
  kiroPath: string | null;
  theme: "dark" | "light" | null;
  cwd: string | null;
}

export const checkSystem = () => invoke<SystemReport>("check_system");

export const locateKiro = () => invoke<KiroInfo | null>("locate_kiro");

export const installKiro = () => invoke<KiroInfo>("install_kiro");

export const checkAuth = () => invoke<boolean>("check_auth");

export const getConfig = () => invoke<AppConfig>("get_config");

export const setConfig = (config: AppConfig) => invoke<void>("set_config", { config });

export const onInstallProgress = (cb: (line: string) => void): Promise<UnlistenFn> =>
  listen<{ line: string }>("install://progress", (e) => cb(e.payload.line));

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
