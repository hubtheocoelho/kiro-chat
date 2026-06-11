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

export const ptyWrite = (data: string) => invoke<void>("pty_write", { data });

export const ptyResize = (cols: number, rows: number) => invoke<void>("pty_resize", { cols, rows });

export const ptyKill = () => invoke<void>("pty_kill");

export const onPtyOutput = (cb: (p: PtyOutput) => void): Promise<UnlistenFn> =>
  listen<PtyOutput>("pty://output", (e) => cb(e.payload));

export const onPtyExit = (cb: (p: PtyExit) => void): Promise<UnlistenFn> =>
  listen<PtyExit>("pty://exit", (e) => cb(e.payload));

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
