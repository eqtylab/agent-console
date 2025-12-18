mod claude_code;
mod git;
mod process;
mod search;
mod terminal;
mod watcher;

use claude_code::{FileDiff, FileEdit, PolicyEvaluation, Project, Session};
use git::GitFileDiff;
use std::path::Path;
use tauri::{AppHandle, State};
use terminal::TerminalType;
use watcher::WatcherState;

/// Discover all Claude Code projects (lightweight - no session content parsing).
#[tauri::command]
fn get_projects() -> Vec<Project> {
    claude_code::discover_projects()
}

/// Get full session details for a specific project (on-demand).
#[tauri::command]
fn get_project_sessions(project_path: String) -> Vec<Session> {
    claude_code::get_sessions_for_project(&project_path)
}

/// Get active Claude Code sessions (projects with running claude process).
#[tauri::command]
fn get_active_sessions() -> process::ActiveSessionsResult {
    process::get_active_sessions()
}

/// Get available terminal emulators on this system.
#[tauri::command]
fn get_available_terminals() -> Vec<TerminalType> {
    terminal::get_available_terminals()
}

/// Launch Claude Code in a terminal.
#[tauri::command]
fn launch_claude(
    terminal_type: TerminalType,
    project_path: String,
    continue_session: bool,
    yolo_mode: bool,
) -> Result<(), String> {
    let mut cmd = String::from("claude");

    if continue_session {
        cmd.push_str(" --continue");
    }

    if yolo_mode {
        cmd.push_str(" --dangerously-skip-permissions");
    }

    terminal::launch_terminal(&terminal_type, &project_path, &cmd)
}

/// Get file edits for a session (lightweight - just file list and types).
#[tauri::command]
fn get_session_file_edits(project_path: String, session_id: String) -> Vec<FileEdit> {
    claude_code::get_session_file_edits(&project_path, &session_id)
}

/// Get all diffs for a specific file in a session.
#[tauri::command]
fn get_file_diffs(project_path: String, session_id: String, file_path: String) -> Vec<FileDiff> {
    claude_code::get_file_diffs(&project_path, &session_id, &file_path)
}

/// Get git diff for a file (HEAD vs working directory).
#[tauri::command]
fn get_git_file_diff(project_path: String, file_path: String) -> Result<GitFileDiff, String> {
    git::get_git_file_diff(&project_path, &file_path)
}

/// Get paginated events from a session for the log viewer.
/// Events are returned in descending order (newest first).
#[tauri::command]
fn get_session_events(
    project_path: String,
    session_id: String,
    offset: Option<u32>,
    limit: Option<u32>,
) -> claude_code::SessionEventsResponse {
    claude_code::get_session_events(&project_path, &session_id, offset, limit)
}

/// Get the raw JSON for a specific event by its byte offset.
#[tauri::command]
fn get_event_raw_json(
    project_path: String,
    session_id: String,
    byte_offset: u64,
) -> Option<String> {
    claude_code::get_event_raw_json(&project_path, &session_id, byte_offset)
}

/// Get paginated events from a sub-agent session for the log viewer.
#[tauri::command]
fn get_subagent_events(
    project_path: String,
    agent_id: String,
    offset: Option<u32>,
    limit: Option<u32>,
) -> claude_code::SessionEventsResponse {
    claude_code::get_subagent_events(&project_path, &agent_id, offset, limit)
}

/// Get the raw JSON for a specific event in a sub-agent session.
#[tauri::command]
fn get_subagent_raw_json(
    project_path: String,
    agent_id: String,
    byte_offset: u64,
) -> Option<String> {
    claude_code::get_subagent_raw_json(&project_path, &agent_id, byte_offset)
}

/// Search session events for matching text.
/// Supports boolean expressions: `error`, `error bash` (implicit AND),
/// `error AND bash`, `error OR warning`.
#[tauri::command]
fn search_session_events(
    project_path: String,
    session_id: String,
    query: String,
    max_results: Option<u32>,
) -> search::SearchResponse {
    search::search_session(&project_path, &session_id, &query, max_results)
}

/// Search sub-agent events for matching text.
#[tauri::command]
fn search_subagent_events(
    project_path: String,
    agent_id: String,
    query: String,
    max_results: Option<u32>,
) -> search::SearchResponse {
    search::search_subagent(&project_path, &agent_id, &query, max_results)
}

/// Start watching a session file for changes.
#[tauri::command]
fn watch_session(
    app_handle: AppHandle,
    state: State<'_, WatcherState>,
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    watcher::watch_session(app_handle, &state, project_path, session_id)
}

/// Stop watching a session file.
#[tauri::command]
fn unwatch_session(
    state: State<'_, WatcherState>,
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    watcher::unwatch_session(&state, &project_path, &session_id)
}

/// Start watching a sub-agent file for changes.
#[tauri::command]
fn watch_subagent(
    app_handle: AppHandle,
    state: State<'_, WatcherState>,
    project_path: String,
    agent_id: String,
) -> Result<(), String> {
    watcher::watch_subagent(app_handle, &state, project_path, agent_id)
}

/// Stop watching a sub-agent file.
#[tauri::command]
fn unwatch_subagent(
    state: State<'_, WatcherState>,
    project_path: String,
    agent_id: String,
) -> Result<(), String> {
    watcher::unwatch_subagent(&state, &project_path, &agent_id)
}

/// Start watching a project's telemetry directory for changes.
#[tauri::command]
fn watch_telemetry(
    app_handle: AppHandle,
    state: State<'_, WatcherState>,
    project_path: String,
) -> Result<(), String> {
    watcher::watch_telemetry(app_handle, &state, project_path)
}

/// Stop watching a project's telemetry directory.
#[tauri::command]
fn unwatch_telemetry(state: State<'_, WatcherState>, project_path: String) -> Result<(), String> {
    watcher::unwatch_telemetry(&state, &project_path)
}

/// Get list of policy evaluations for a project.
#[tauri::command]
fn get_policy_evaluations(project_path: String) -> Vec<PolicyEvaluation> {
    claude_code::get_policy_evaluations(&project_path)
}

/// Get raw JSON for a specific policy evaluation.
#[tauri::command]
fn get_policy_evaluation(project_path: String, filename: String) -> Option<String> {
    claude_code::get_policy_evaluation(&project_path, &filename)
}

/// Reveal a path in the system file manager.
/// - macOS: Finder
/// - Windows: Explorer
/// - Linux: Default file manager (via xdg-open)
#[tauri::command]
async fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try to use xdg-open on the parent directory
        // Most Linux file managers don't support selecting a specific file
        let dir = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };

        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            get_projects,
            get_project_sessions,
            get_active_sessions,
            get_available_terminals,
            launch_claude,
            get_session_file_edits,
            get_file_diffs,
            get_git_file_diff,
            get_session_events,
            get_event_raw_json,
            get_subagent_events,
            get_subagent_raw_json,
            search_session_events,
            search_subagent_events,
            watch_session,
            unwatch_session,
            watch_subagent,
            unwatch_subagent,
            watch_telemetry,
            unwatch_telemetry,
            get_policy_evaluations,
            get_policy_evaluation,
            reveal_in_file_manager
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
