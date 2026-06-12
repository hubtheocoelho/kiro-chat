use std::io;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

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

// Bounded variant of Command::output for short probe commands: a hung child
// (corrupted binary, unexpected prompt) must not freeze the app forever.
// Suitable only for small outputs — the pipes are drained after exit.
pub fn output_with_timeout(mut cmd: Command, timeout: Duration) -> io::Result<Output> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide(&mut cmd);
    let mut child = cmd.spawn()?;
    let deadline = Instant::now() + timeout;
    while child.try_wait()?.is_none() {
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(io::Error::new(io::ErrorKind::TimedOut, "child process timed out"));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    child.wait_with_output()
}
