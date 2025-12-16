//! Process detection for active Claude Code sessions.
//!
//! This module provides cross-platform detection of running Claude Code processes
//! and their working directories.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::process::Command;

/// Result of active session detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSessionsResult {
    /// Whether this feature is supported on the current platform.
    pub supported: bool,
    /// Set of project paths with active Claude sessions.
    pub active_paths: HashSet<String>,
}

/// Detect active Claude Code sessions and return their working directories.
///
/// # Platform Support
/// - **macOS**: Full support via `ps` and `lsof`
/// - **Linux**: Full support via `ps` and `/proc`
/// - **Windows**: Not currently supported (returns supported=false)
pub fn get_active_sessions() -> ActiveSessionsResult {
    #[cfg(target_os = "macos")]
    {
        ActiveSessionsResult {
            supported: true,
            active_paths: detect_macos_sessions(),
        }
    }

    #[cfg(target_os = "linux")]
    {
        ActiveSessionsResult {
            supported: true,
            active_paths: detect_linux_sessions(),
        }
    }

    #[cfg(target_os = "windows")]
    {
        ActiveSessionsResult {
            supported: false,
            active_paths: HashSet::new(),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        ActiveSessionsResult {
            supported: false,
            active_paths: HashSet::new(),
        }
    }
}

/// Detect Claude sessions on macOS.
#[cfg(target_os = "macos")]
fn detect_macos_sessions() -> HashSet<String> {
    let mut paths = HashSet::new();

    for pid in get_claude_pids() {
        if let Some(cwd) = get_process_cwd_macos(pid) {
            paths.insert(cwd);
        }
    }

    paths
}

/// Detect Claude sessions on Linux.
#[cfg(target_os = "linux")]
fn detect_linux_sessions() -> HashSet<String> {
    let mut paths = HashSet::new();

    for pid in get_claude_pids() {
        if let Some(cwd) = get_process_cwd_linux(pid) {
            paths.insert(cwd);
        }
    }

    paths
}

/// Get PIDs of all running "claude" processes.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn get_claude_pids() -> Vec<u32> {
    // Use ps which is more reliable than pgrep across systems
    let output = Command::new("ps")
        .args(["-eo", "pid,comm"])
        .output()
        .ok();

    let Some(output) = output else {
        return Vec::new();
    };

    let stdout = String::from_utf8_lossy(&output.stdout);

    stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && parts[1] == "claude" {
                parts[0].parse::<u32>().ok()
            } else {
                None
            }
        })
        .collect()
}

/// Get the current working directory of a process by PID on macOS.
#[cfg(target_os = "macos")]
fn get_process_cwd_macos(pid: u32) -> Option<String> {
    let output = Command::new("lsof")
        .args(["-p", &pid.to_string()])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        if line.contains("cwd") {
            // lsof output format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
            // The NAME (last field) is what we want
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(path) = parts.last() {
                return Some(path.to_string());
            }
        }
    }

    None
}

/// Get the current working directory of a process by PID on Linux.
#[cfg(target_os = "linux")]
fn get_process_cwd_linux(pid: u32) -> Option<String> {
    let proc_path = format!("/proc/{}/cwd", pid);
    std::fs::read_link(&proc_path)
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_active_sessions_returns_result() {
        let result = get_active_sessions();

        #[cfg(any(target_os = "macos", target_os = "linux"))]
        assert!(result.supported);

        #[cfg(target_os = "windows")]
        assert!(!result.supported);
    }
}
