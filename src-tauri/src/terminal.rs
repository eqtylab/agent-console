//! Terminal launching utilities.
//!
//! This module provides cross-platform terminal launching with command execution.

use serde::{Deserialize, Serialize};
use std::process::Command;

/// Escape a string for safe use in shell commands.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Supported terminal emulators.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalType {
    /// macOS Terminal.app
    MacosTerminal,
    /// Ghostty
    Ghostty,
    /// iTerm2
    Iterm2,
    /// Windows Terminal
    WindowsTerminal,
    /// GNOME Terminal
    GnomeTerminal,
    /// Konsole
    Konsole,
    /// Alacritty
    Alacritty,
}

/// Get available terminals for the current platform.
pub fn get_available_terminals() -> Vec<TerminalType> {
    #[cfg(target_os = "macos")]
    {
        let mut terminals = vec![TerminalType::MacosTerminal];

        // Check if Ghostty is installed
        if std::path::Path::new("/Applications/Ghostty.app").exists() {
            terminals.push(TerminalType::Ghostty);
        }

        // Check if iTerm2 is installed
        if std::path::Path::new("/Applications/iTerm.app").exists() {
            terminals.push(TerminalType::Iterm2);
        }

        // Check if Alacritty is installed
        if std::path::Path::new("/Applications/Alacritty.app").exists() {
            terminals.push(TerminalType::Alacritty);
        }

        terminals
    }

    #[cfg(target_os = "linux")]
    {
        let mut terminals = Vec::new();

        // Check common Linux terminals
        if Command::new("which")
            .arg("gnome-terminal")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            terminals.push(TerminalType::GnomeTerminal);
        }

        if Command::new("which")
            .arg("konsole")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            terminals.push(TerminalType::Konsole);
        }

        if Command::new("which")
            .arg("alacritty")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            terminals.push(TerminalType::Alacritty);
        }

        if Command::new("which")
            .arg("ghostty")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            terminals.push(TerminalType::Ghostty);
        }

        terminals
    }

    #[cfg(target_os = "windows")]
    {
        vec![TerminalType::WindowsTerminal]
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Vec::new()
    }
}

/// Launch a terminal with a command in a specific directory.
pub fn launch_terminal(
    terminal: &TerminalType,
    cwd: &str,
    command: &str,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        launch_terminal_macos(terminal, cwd, command)
    }

    #[cfg(target_os = "linux")]
    {
        launch_terminal_linux(terminal, cwd, command)
    }

    #[cfg(target_os = "windows")]
    {
        launch_terminal_windows(terminal, cwd, command)
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("Terminal launching not supported on this platform".to_string())
    }
}

#[cfg(target_os = "macos")]
fn launch_terminal_macos(
    terminal: &TerminalType,
    cwd: &str,
    command: &str,
) -> Result<(), String> {
    // Escape single quotes in paths and commands for AppleScript
    let escaped_cwd = cwd.replace('\\', "\\\\").replace('"', "\\\"");
    let escaped_cmd = command.replace('\\', "\\\\").replace('"', "\\\"");

    let full_command = format!("cd \"{}\" && {}", escaped_cwd, escaped_cmd);

    match terminal {
        TerminalType::MacosTerminal => {
            let script = format!(
                r#"tell application "Terminal"
                    activate
                    do script "{}"
                end tell"#,
                full_command.replace('"', "\\\"")
            );

            Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .spawn()
                .map_err(|e| format!("Failed to launch Terminal.app: {}", e))?;
        }
        TerminalType::Ghostty => {
            // Ghostty on macOS: open new window, copy command to clipboard, paste it
            // This avoids keystroke escaping issues with special characters in paths

            // First, copy command to clipboard
            Command::new("sh")
                .arg("-c")
                .arg(format!("printf '%s' {} | pbcopy", shell_escape(&full_command)))
                .output()
                .map_err(|e| format!("Failed to copy to clipboard: {}", e))?;

            // Then activate Ghostty, open new window, and paste
            let script = r#"tell application "Ghostty"
                activate
            end tell
            delay 0.3
            tell application "System Events"
                tell process "Ghostty"
                    keystroke "n" using command down
                    delay 0.2
                    keystroke "v" using command down
                    delay 0.1
                    keystroke return
                end tell
            end tell"#;

            Command::new("osascript")
                .arg("-e")
                .arg(script)
                .spawn()
                .map_err(|e| format!("Failed to launch Ghostty: {}", e))?;
        }
        TerminalType::Iterm2 => {
            let script = format!(
                r#"tell application "iTerm"
                    activate
                    create window with default profile command "{}"
                end tell"#,
                full_command.replace('"', "\\\"")
            );

            Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .spawn()
                .map_err(|e| format!("Failed to launch iTerm2: {}", e))?;
        }
        TerminalType::Alacritty => {
            Command::new("open")
                .arg("-na")
                .arg("Alacritty")
                .arg("--args")
                .arg("-e")
                .arg("sh")
                .arg("-c")
                .arg(&full_command)
                .spawn()
                .map_err(|e| format!("Failed to launch Alacritty: {}", e))?;
        }
        _ => {
            return Err(format!("Terminal {:?} not supported on macOS", terminal));
        }
    }

    Ok(())
}

#[cfg(target_os = "linux")]
fn launch_terminal_linux(
    terminal: &TerminalType,
    cwd: &str,
    command: &str,
) -> Result<(), String> {
    let full_command = format!("cd '{}' && {}", cwd, command);

    match terminal {
        TerminalType::GnomeTerminal => {
            Command::new("gnome-terminal")
                .arg("--")
                .arg("sh")
                .arg("-c")
                .arg(&full_command)
                .spawn()
                .map_err(|e| format!("Failed to launch gnome-terminal: {}", e))?;
        }
        TerminalType::Konsole => {
            Command::new("konsole")
                .arg("-e")
                .arg("sh")
                .arg("-c")
                .arg(&full_command)
                .spawn()
                .map_err(|e| format!("Failed to launch konsole: {}", e))?;
        }
        TerminalType::Alacritty => {
            Command::new("alacritty")
                .arg("-e")
                .arg("sh")
                .arg("-c")
                .arg(&full_command)
                .spawn()
                .map_err(|e| format!("Failed to launch alacritty: {}", e))?;
        }
        TerminalType::Ghostty => {
            Command::new("ghostty")
                .arg("-e")
                .arg("sh")
                .arg("-c")
                .arg(&full_command)
                .spawn()
                .map_err(|e| format!("Failed to launch ghostty: {}", e))?;
        }
        _ => {
            return Err(format!("Terminal {:?} not supported on Linux", terminal));
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn launch_terminal_windows(
    terminal: &TerminalType,
    cwd: &str,
    command: &str,
) -> Result<(), String> {
    match terminal {
        TerminalType::WindowsTerminal => {
            Command::new("wt")
                .arg("-d")
                .arg(cwd)
                .arg("cmd")
                .arg("/c")
                .arg(command)
                .spawn()
                .map_err(|e| format!("Failed to launch Windows Terminal: {}", e))?;
        }
        _ => {
            return Err(format!("Terminal {:?} not supported on Windows", terminal));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_available_terminals() {
        let terminals = get_available_terminals();
        // Should return at least one terminal on supported platforms
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        assert!(!terminals.is_empty());
    }
}
