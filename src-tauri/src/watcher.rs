//! Session file watcher for real-time edit updates.
//!
//! Watches Claude Code session JSONL files and emits Tauri events when changes occur.

use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebouncedEventKind};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Event payload sent to the frontend when a session file changes.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionChangedPayload {
    pub project_path: String,
    pub session_id: String,
}

/// Event payload sent to the frontend when a sub-agent file changes.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentChangedPayload {
    pub project_path: String,
    pub agent_id: String,
}

/// Global state for managing file watchers.
pub struct WatcherState {
    /// Map of "project_path:session_id" -> watcher handle (for cleanup)
    watchers: Mutex<HashMap<String, WatcherHandle>>,
}

struct WatcherHandle {
    // The debouncer is kept alive by holding this reference
    _debouncer: notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }
}

/// Get the session file path for watching.
fn get_session_file_path(project_path: &str, session_id: &str) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let encoded_name = project_path.replace('/', "-");
    let session_file = home
        .join(".claude")
        .join("projects")
        .join(&encoded_name)
        .join(format!("{}.jsonl", session_id));

    if session_file.exists() {
        Some(session_file)
    } else {
        None
    }
}

/// Start watching a session file for changes.
pub fn watch_session(
    app_handle: AppHandle,
    state: &WatcherState,
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    let key = format!("{}:{}", project_path, session_id);

    // Check if already watching
    {
        let watchers = state.watchers.lock().map_err(|e| e.to_string())?;
        if watchers.contains_key(&key) {
            return Ok(()); // Already watching
        }
    }

    let session_file = get_session_file_path(&project_path, &session_id)
        .ok_or_else(|| format!("Session file not found for {}", session_id))?;

    let project_path_clone = project_path.clone();
    let session_id_clone = session_id.clone();

    // Create debounced watcher with 500ms debounce
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |result: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if let Ok(events) = result {
                for event in events {
                    if event.kind == DebouncedEventKind::Any {
                        // Emit event to frontend
                        let _ = app_handle.emit(
                            "session-changed",
                            SessionChangedPayload {
                                project_path: project_path_clone.clone(),
                                session_id: session_id_clone.clone(),
                            },
                        );
                        break; // Only emit once per batch
                    }
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch the session file
    debouncer
        .watcher()
        .watch(&session_file, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch file: {}", e))?;

    // Store the watcher handle
    {
        let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
        watchers.insert(
            key,
            WatcherHandle {
                _debouncer: debouncer,
            },
        );
    }

    Ok(())
}

/// Stop watching a session file.
pub fn unwatch_session(
    state: &WatcherState,
    project_path: &str,
    session_id: &str,
) -> Result<(), String> {
    let key = format!("{}:{}", project_path, session_id);

    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    watchers.remove(&key);

    Ok(())
}

/// Get the sub-agent file path for watching.
fn get_subagent_file_path(project_path: &str, agent_id: &str) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let encoded_name = project_path.replace('/', "-");
    let agent_file = home
        .join(".claude")
        .join("projects")
        .join(&encoded_name)
        .join(format!("agent-{}.jsonl", agent_id));

    if agent_file.exists() {
        Some(agent_file)
    } else {
        None
    }
}

/// Start watching a sub-agent file for changes.
pub fn watch_subagent(
    app_handle: AppHandle,
    state: &WatcherState,
    project_path: String,
    agent_id: String,
) -> Result<(), String> {
    let key = format!("{}:agent:{}", project_path, agent_id);

    // Check if already watching
    {
        let watchers = state.watchers.lock().map_err(|e| e.to_string())?;
        if watchers.contains_key(&key) {
            return Ok(()); // Already watching
        }
    }

    let agent_file = get_subagent_file_path(&project_path, &agent_id)
        .ok_or_else(|| format!("Sub-agent file not found for {}", agent_id))?;

    let project_path_clone = project_path.clone();
    let agent_id_clone = agent_id.clone();

    // Create debounced watcher with 500ms debounce
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |result: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if let Ok(events) = result {
                for event in events {
                    if event.kind == DebouncedEventKind::Any {
                        // Emit event to frontend
                        let _ = app_handle.emit(
                            "subagent-changed",
                            SubagentChangedPayload {
                                project_path: project_path_clone.clone(),
                                agent_id: agent_id_clone.clone(),
                            },
                        );
                        break; // Only emit once per batch
                    }
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch the agent file
    debouncer
        .watcher()
        .watch(&agent_file, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch file: {}", e))?;

    // Store the watcher handle
    {
        let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
        watchers.insert(
            key,
            WatcherHandle {
                _debouncer: debouncer,
            },
        );
    }

    Ok(())
}

/// Stop watching a sub-agent file.
pub fn unwatch_subagent(
    state: &WatcherState,
    project_path: &str,
    agent_id: &str,
) -> Result<(), String> {
    let key = format!("{}:agent:{}", project_path, agent_id);

    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    watchers.remove(&key);

    Ok(())
}

/// Event payload sent to the frontend when telemetry files change.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryChangedPayload {
    pub project_path: String,
}

/// Get the telemetry directory path for a project.
fn get_telemetry_dir_path(project_path: &str) -> PathBuf {
    PathBuf::from(project_path)
        .join(".cupcake")
        .join("telemetry")
}

/// Start watching a project's telemetry directory for changes.
pub fn watch_telemetry(
    app_handle: AppHandle,
    state: &WatcherState,
    project_path: String,
) -> Result<(), String> {
    let key = format!("{}:telemetry", project_path);

    // Check if already watching
    {
        let watchers = state.watchers.lock().map_err(|e| e.to_string())?;
        if watchers.contains_key(&key) {
            return Ok(()); // Already watching
        }
    }

    let telemetry_dir = get_telemetry_dir_path(&project_path);

    // Create the directory if it doesn't exist (so we can watch it)
    if !telemetry_dir.exists() {
        std::fs::create_dir_all(&telemetry_dir)
            .map_err(|e| format!("Failed to create telemetry dir: {}", e))?;
    }

    let project_path_clone = project_path.clone();

    // Create debounced watcher with 300ms debounce
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |result: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if let Ok(events) = result {
                for event in events {
                    if event.kind == DebouncedEventKind::Any {
                        // Only emit for JSON files
                        if event
                            .path
                            .extension()
                            .map(|e| e == "json")
                            .unwrap_or(false)
                        {
                            let _ = app_handle.emit(
                                "telemetry-changed",
                                TelemetryChangedPayload {
                                    project_path: project_path_clone.clone(),
                                },
                            );
                            break; // Only emit once per batch
                        }
                    }
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch the telemetry directory
    debouncer
        .watcher()
        .watch(&telemetry_dir, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch telemetry dir: {}", e))?;

    // Store the watcher handle
    {
        let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
        watchers.insert(
            key,
            WatcherHandle {
                _debouncer: debouncer,
            },
        );
    }

    Ok(())
}

/// Stop watching a project's telemetry directory.
pub fn unwatch_telemetry(state: &WatcherState, project_path: &str) -> Result<(), String> {
    let key = format!("{}:telemetry", project_path);

    let mut watchers = state.watchers.lock().map_err(|e| e.to_string())?;
    watchers.remove(&key);

    Ok(())
}
