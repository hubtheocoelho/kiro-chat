use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemReport {
    pub os: String,
    pub win11: bool,
    pub arch_ok: bool,
    pub online: bool,
}

#[tauri::command]
pub async fn check_system() -> Result<SystemReport, String> {
    tauri::async_runtime::spawn_blocking(check_system_blocking)
        .await
        .map_err(|e| e.to_string())
}

fn check_system_blocking() -> SystemReport {
    SystemReport {
        os: std::env::consts::OS.to_string(),
        // Kiro CLI requires Windows 11 (build 22000+); other OSes pass the
        // check since the requirement does not apply there.
        win11: windows_build().map(|b| b >= 22000).unwrap_or(!cfg!(windows)),
        arch_ok: cfg!(target_arch = "x86_64") || cfg!(target_arch = "aarch64"),
        online: probe_online(),
    }
}

#[cfg(windows)]
fn windows_build() -> Option<u32> {
    use std::process::Command;

    let mut cmd = Command::new("reg");
    cmd.args([
        "query",
        r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion",
        "/v",
        "CurrentBuildNumber",
    ]);
    let out = crate::proc::output_with_timeout(cmd, std::time::Duration::from_secs(5)).ok()?;
    String::from_utf8_lossy(&out.stdout)
        .split_whitespace()
        .last()?
        .parse()
        .ok()
}

#[cfg(not(windows))]
fn windows_build() -> Option<u32> {
    None
}

fn probe_online() -> bool {
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;

    for host in ["cli.kiro.dev:443", "github.com:443"] {
        if let Ok(addrs) = host.to_socket_addrs() {
            for addr in addrs {
                if TcpStream::connect_timeout(&addr, Duration::from_secs(2)).is_ok() {
                    return true;
                }
            }
        }
    }
    false
}
