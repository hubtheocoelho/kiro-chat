use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

// Monotonic session id; events carry it so the frontend can drop output that
// belongs to a session it already abandoned.
static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct PtyState(Arc<Mutex<Option<PtySession>>>);

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Clone, Serialize)]
struct OutputPayload {
    #[serde(rename = "gen")]
    generation: u64,
    data: String,
}

#[derive(Clone, Serialize)]
struct ExitPayload {
    #[serde(rename = "gen")]
    generation: u64,
    code: Option<i32>,
}

pub struct SpawnSpec {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
}

pub fn default_shell() -> SpawnSpec {
    #[cfg(windows)]
    {
        SpawnSpec {
            program: "powershell.exe".into(),
            args: vec!["-NoLogo".into()],
            cwd: None,
        }
    }
    #[cfg(not(windows))]
    {
        SpawnSpec {
            program: std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into()),
            args: vec![],
            cwd: None,
        }
    }
}

pub fn spawn_session(
    app: &AppHandle,
    state: &PtyState,
    spec: SpawnSpec,
    cols: u16,
    rows: u16,
) -> Result<u64, String> {
    kill_current(state);

    let generation = NEXT_GENERATION.fetch_add(1, Ordering::SeqCst);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.max(2),
            cols: cols.max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty: {e}"))?;

    let mut cmd = CommandBuilder::new(&spec.program);
    cmd.args(&spec.args);
    let cwd = spec
        .cwd
        .or_else(|| dirs::home_dir().map(|p| p.to_string_lossy().into_owned()));
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "KiroChat");
    #[cfg(not(windows))]
    cmd.env("TERM", "xterm-256color");

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn {}: {e}", spec.program))?;
    drop(pair.slave);

    let killer = child.clone_killer();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let out_app = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let payload = OutputPayload {
                        generation,
                        data: BASE64.encode(&buf[..n]),
                    };
                    let _ = out_app.emit("pty://output", payload);
                }
            }
        }
    });

    let exit_app = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|s| s.exit_code() as i32);
        let _ = exit_app.emit("pty://exit", ExitPayload { generation, code });
    });

    *state.0.lock() = Some(PtySession {
        master: pair.master,
        writer,
        killer,
    });
    Ok(generation)
}

fn kill_current(state: &PtyState) {
    if let Some(mut session) = state.0.lock().take() {
        let _ = session.killer.kill();
    }
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<PtyState>,
    mode: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<u64, String> {
    let spec = match mode.as_str() {
        "chat" => crate::kiro::chat_spec(&app, cwd)?,
        "login" => crate::kiro::login_spec(&app)?,
        "shell" => {
            let mut s = default_shell();
            s.cwd = cwd;
            s
        }
        other => return Err(format!("unknown spawn mode: {other}")),
    };
    spawn_session(&app, &state, spec, cols, rows)
}

#[tauri::command]
pub fn pty_write(state: State<PtyState>, data: String) -> Result<(), String> {
    let mut guard = state.0.lock();
    let session = guard.as_mut().ok_or("no active session")?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(state: State<PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    let guard = state.0.lock();
    let session = guard.as_ref().ok_or("no active session")?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(2),
            cols: cols.max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: State<PtyState>) {
    kill_current(&state);
}

#[cfg(test)]
mod tests {
    use std::io::Read;

    use portable_pty::{native_pty_system, CommandBuilder, PtySize};

    #[test]
    fn pty_round_trip() {
        let pty = native_pty_system();
        let pair = pty
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();

        #[cfg(windows)]
        let cmd = {
            let mut c = CommandBuilder::new("cmd.exe");
            c.args(["/C", "echo kiro-pty-ok"]);
            c
        };
        #[cfg(not(windows))]
        let cmd = {
            let mut c = CommandBuilder::new("echo");
            c.arg("kiro-pty-ok");
            c
        };

        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut out = String::new();
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => out.push_str(&String::from_utf8_lossy(&buf[..n])),
            }
        }
        child.wait().unwrap();
        assert!(out.contains("kiro-pty-ok"), "pty output was: {out:?}");
    }
}
