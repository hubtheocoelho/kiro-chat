#![cfg_attr(not(windows), allow(dead_code))]

use std::path::Path;

// Persists `dir` into the user's PATH (HKCU) so kiro-cli also works from
// regular terminals opened after installation. Returns true when PATH changed.
#[cfg(windows)]
pub fn ensure_user_path(dir: &Path) -> Result<bool, String> {
    use std::process::{Command, Stdio};

    let dir = dir.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$dir = '{dir}'\n\
         $cur = [Environment]::GetEnvironmentVariable('Path', 'User')\n\
         if (-not $cur) {{ $cur = '' }}\n\
         $parts = $cur -split ';' | Where-Object {{ $_ -ne '' }}\n\
         if ($parts -notcontains $dir) {{\n\
           [Environment]::SetEnvironmentVariable('Path', (($parts + $dir) -join ';'), 'User')\n\
           Write-Output 'CHANGED'\n\
         }} else {{ Write-Output 'UNCHANGED' }}"
    );
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .stdin(Stdio::null());
    crate::proc::hide(&mut cmd);
    let out = cmd.output().map_err(|e| format!("powershell: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "PATH update failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).contains("CHANGED"))
}

// On Unix the official installer already targets ~/.local/bin, which login
// shells put on PATH; nothing to persist.
#[cfg(not(windows))]
pub fn ensure_user_path(_dir: &Path) -> Result<bool, String> {
    Ok(false)
}
