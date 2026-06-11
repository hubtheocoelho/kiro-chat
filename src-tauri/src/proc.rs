use std::process::Command;

// On Windows, child consoles would flash a window for every helper invocation
// (reg, powershell, kiro-cli checks); CREATE_NO_WINDOW keeps them invisible.
pub fn hide(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}
