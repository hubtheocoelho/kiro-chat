use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

// Monotonic session id; events carry it so the frontend can route output to
// the tab that owns the session and drop output of sessions it abandoned.
static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

// Each writer lives behind its own lock: writes block while the child is not
// draining input, and that must not wedge resize/kill/spawn of any session,
// which only need the map locks.
type SharedWriter = Arc<Mutex<Box<dyn Write + Send>>>;

// Sessions are keyed by generation so several tabs can run concurrently.
#[derive(Default)]
pub struct PtyState {
    sessions: Arc<Mutex<HashMap<u64, PtySession>>>,
    writers: Arc<Mutex<HashMap<u64, SharedWriter>>>,
}

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
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
    // A stale configured folder (deleted, offline drive) must not break the
    // chat: fall back to the home directory.
    let cwd = spec
        .cwd
        .filter(|dir| std::path::Path::new(dir).is_dir())
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

    // Register the session before watching for its exit so a child that dies
    // immediately cannot have its map entries removed before they exist.
    state.sessions.lock().insert(
        generation,
        PtySession {
            master: pair.master,
            killer,
        },
    );
    state.writers.lock().insert(generation, Arc::new(Mutex::new(writer)));

    let exit_app = app.clone();
    let sessions = state.sessions.clone();
    let writers = state.writers.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|s| s.exit_code() as i32);
        sessions.lock().remove(&generation);
        writers.lock().remove(&generation);
        let _ = exit_app.emit("pty://exit", ExitPayload { generation, code });
    });

    Ok(generation)
}

fn kill_session(state: &PtyState, generation: u64) {
    // Kill the child before dropping the writer: a write blocked on a
    // stuffed pipe only returns once the child dies.
    if let Some(mut session) = state.sessions.lock().remove(&generation) {
        let _ = session.killer.kill();
    }
    state.writers.lock().remove(&generation);
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
pub fn pty_write(state: State<PtyState>, generation: u64, data: String) -> Result<(), String> {
    // Clone the handle and drop the map lock before writing so a blocked
    // write never wedges the other sessions.
    let writer = state
        .writers
        .lock()
        .get(&generation)
        .cloned()
        .ok_or("no active session")?;
    let mut writer = writer.lock();
    writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    state: State<PtyState>,
    generation: u64,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let guard = state.sessions.lock();
    let session = guard.get(&generation).ok_or("no active session")?;
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
pub fn pty_kill(state: State<PtyState>, generation: u64) {
    kill_session(&state, generation);
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
        let mut writer = pair.master.take_writer().unwrap();

        // ConPTY readers do not reliably observe EOF even after the child
        // exits and the master is dropped, so never block the test on it:
        // stream chunks through a channel and stop on match or deadline.
        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
        let mut out = String::new();
        let mut dsr_answered = false;
        while !out.contains("kiro-pty-ok") && std::time::Instant::now() < deadline {
            match rx.recv_timeout(std::time::Duration::from_millis(500)) {
                Ok(chunk) => out.push_str(&String::from_utf8_lossy(&chunk)),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
            // ConPTY asks the terminal where the cursor is (DSR, ESC[6n) and
            // stalls all output until something answers, as xterm.js does in
            // the real app. Play the terminal's part here.
            if !dsr_answered && out.contains("\u{1b}[6n") {
                let _ = writer.write_all(b"\x1b[1;1R");
                let _ = writer.flush();
                dsr_answered = true;
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        assert!(out.contains("kiro-pty-ok"), "pty output was: {out:?}");
    }
}
