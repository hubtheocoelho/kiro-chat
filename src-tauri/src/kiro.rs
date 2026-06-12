use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::config;
use crate::pty::SpawnSpec;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KiroInfo {
    pub path: String,
    pub version: Option<String>,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    line: String,
}

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "kiro-cli.exe"
    } else {
        "kiro-cli"
    }
}

// ------------------------------------------------------------------ locating

// The official installer's destination directory is not contractual, so the
// search is layered: last known path, then PATH, then known per-user install
// dirs, then a scan of %LOCALAPPDATA%\Programs for kiro* folders.
pub fn locate(app: &AppHandle) -> Option<PathBuf> {
    if let Some(stored) = config::load(app).kiro_path {
        let path = PathBuf::from(&stored);
        if path.is_file() {
            return Some(path);
        }
    }
    locate_fresh()
}

fn locate_fresh() -> Option<PathBuf> {
    find_in_path_env()
        .or_else(|| find_in_dirs(candidate_dirs()))
        .or_else(scan_programs)
}

fn find_in_dirs<I: IntoIterator<Item = PathBuf>>(dirs_iter: I) -> Option<PathBuf> {
    dirs_iter
        .into_iter()
        .map(|d| d.join(binary_name()))
        .find(|p| p.is_file())
}

fn find_in_path_env() -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    find_in_dirs(std::env::split_paths(&path_var))
}

fn candidate_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(home) = dirs::home_dir() {
        out.push(home.join(".local").join("bin"));
        out.push(home.join(".kiro").join("bin"));
    }
    #[cfg(windows)]
    if let Some(local) = dirs::data_local_dir() {
        for base in [local.join("Programs").join("kiro-cli"), local.join("kiro-cli")] {
            out.push(base.join("bin"));
            out.push(base);
        }
    }
    out
}

#[cfg(windows)]
fn scan_programs() -> Option<PathBuf> {
    let programs = dirs::data_local_dir()?.join("Programs");
    for entry in std::fs::read_dir(programs).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if !name.starts_with("kiro") {
            continue;
        }
        let base = entry.path();
        for candidate in [base.join(binary_name()), base.join("bin").join(binary_name())] {
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(not(windows))]
fn scan_programs() -> Option<PathBuf> {
    None
}

fn version(bin: &Path) -> Option<String> {
    let mut cmd = Command::new(bin);
    cmd.arg("--version");
    let out = crate::proc::output_with_timeout(cmd, std::time::Duration::from_secs(10)).ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().next()?.trim().to_string();
    Some(line.rsplit(' ').next().unwrap_or(&line).to_string())
}

fn persist_path(app: &AppHandle, path: &str) {
    let mut cfg = config::load(app);
    if cfg.kiro_path.as_deref() != Some(path) {
        cfg.kiro_path = Some(path.to_string());
        config::save(app, &cfg);
    }
}

fn info_for(app: &AppHandle, path: PathBuf) -> KiroInfo {
    let info = KiroInfo {
        path: path.to_string_lossy().into_owned(),
        version: version(&path),
    };
    persist_path(app, &info.path);
    info
}

// ---------------------------------------------------------------- pty specs

pub fn chat_spec(app: &AppHandle, cwd: Option<String>) -> Result<SpawnSpec, String> {
    let bin = locate(app).ok_or("kiro-cli is not installed")?;
    Ok(SpawnSpec {
        program: bin.to_string_lossy().into_owned(),
        args: vec!["chat".into()],
        cwd,
    })
}

pub fn login_spec(app: &AppHandle) -> Result<SpawnSpec, String> {
    let bin = locate(app).ok_or("kiro-cli is not installed")?;
    Ok(SpawnSpec {
        program: bin.to_string_lossy().into_owned(),
        args: vec!["login".into()],
        cwd: None,
    })
}

// ----------------------------------------------------------------- commands

#[tauri::command]
pub async fn locate_kiro(app: AppHandle) -> Option<KiroInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = locate(&app)?;
        Some(info_for(&app, path))
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn check_auth(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bin = locate(&app).ok_or("kiro-cli is not installed")?;
        let mut cmd = Command::new(&bin);
        cmd.arg("whoami");
        let out = crate::proc::output_with_timeout(cmd, std::time::Duration::from_secs(15))
            .map_err(|e| format!("whoami: {e}"))?;
        Ok(out.status.success())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn install_kiro(app: AppHandle) -> Result<KiroInfo, String> {
    tauri::async_runtime::spawn_blocking(move || install_blocking(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn installer_command() -> Command {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("powershell.exe");
        cmd.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "$ProgressPreference = 'SilentlyContinue'; \
             $ErrorActionPreference = 'Stop'; \
             irm 'https://cli.kiro.dev/install.ps1' | iex",
        ]);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("bash");
        cmd.args(["-lc", "curl -fsSL https://cli.kiro.dev/install | bash"]);
        cmd
    }
}

fn install_blocking(app: &AppHandle) -> Result<KiroInfo, String> {
    let mut cmd = installer_command();
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::proc::hide(&mut cmd);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("could not start the official installer: {e}"))?;

    let tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let mut readers = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        readers.push(stream_lines(app.clone(), stdout, tail.clone()));
    }
    if let Some(stderr) = child.stderr.take() {
        readers.push(stream_lines(app.clone(), stderr, tail.clone()));
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    for handle in readers {
        let _ = handle.join();
    }

    if !status.success() {
        return Err(format!(
            "installer exited with {status}\n{}",
            tail.lock().join("\n")
        ));
    }

    let path = locate_fresh()
        .ok_or("the installer finished but kiro-cli was not found in any known location")?;
    if let Some(dir) = path.parent() {
        let _ = crate::path_env::ensure_user_path(dir);
    }
    Ok(info_for(app, path))
}

fn stream_lines<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    reader: R,
    tail: Arc<Mutex<Vec<String>>>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        for line in std::io::BufReader::new(reader).lines().map_while(Result::ok) {
            let line = line.trim_end().to_string();
            if line.is_empty() {
                continue;
            }
            let _ = app.emit("install://progress", ProgressPayload { line: line.clone() });
            let mut tail = tail.lock();
            tail.push(line);
            if tail.len() > 16 {
                tail.remove(0);
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("kiro-chat-{tag}-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn finds_binary_in_candidate_dirs() {
        let dir = temp_dir("found");
        let bin = dir.join(binary_name());
        fs::write(&bin, b"stub").unwrap();
        let found = find_in_dirs(vec![dir.join("missing-subdir"), dir.clone()]);
        assert_eq!(found, Some(bin));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_binary_returns_none() {
        let dir = temp_dir("none");
        assert_eq!(find_in_dirs(vec![dir.clone()]), None);
        fs::remove_dir_all(&dir).ok();
    }
}
