#![cfg_attr(not(windows), allow(dead_code))]

use std::path::Path;

// Persists `dir` into the user's PATH (HKCU\Environment) so kiro-cli also
// works from regular terminals opened after installation. Returns true when
// PATH changed.
//
// The registry value is read and written RAW with its original value kind:
// [Environment]::GetEnvironmentVariable would expand REG_EXPAND_SZ entries
// like %USERPROFILE% and writing the result back would silently destroy them.
#[cfg(windows)]
pub fn ensure_user_path(dir: &Path) -> Result<bool, String> {
    use std::process::Command;
    use std::time::Duration;

    let dir = dir.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$dir = '{dir}'\n\
         $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)\n\
         try {{\n\
           $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString\n\
           $cur = ''\n\
           if ($key.GetValueNames() -contains 'Path') {{\n\
             $kind = $key.GetValueKind('Path')\n\
             $cur = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)\n\
           }}\n\
           $parts = $cur -split ';' | Where-Object {{ $_ -ne '' }}\n\
           if ($parts -notcontains $dir) {{\n\
             $key.SetValue('Path', (($parts + $dir) -join ';'), $kind)\n\
             [Environment]::SetEnvironmentVariable('KIROCHAT_PATH_REFRESH', '1', 'User')\n\
             [Environment]::SetEnvironmentVariable('KIROCHAT_PATH_REFRESH', $null, 'User')\n\
             Write-Output 'CHANGED'\n\
           }} else {{ Write-Output 'UNCHANGED' }}\n\
         }} finally {{ $key.Close() }}"
    );
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script]);
    let out = crate::proc::output_with_timeout(cmd, Duration::from_secs(30))
        .map_err(|e| format!("powershell: {e}"))?;
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
