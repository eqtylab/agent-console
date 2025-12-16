//! Claude Code session discovery and parsing.
//!
//! This module provides functionality to discover Claude Code projects and sessions
//! from the `~/.claude/projects` directory.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Represents an agent type supported by the collector.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentType {
    ClaudeCode,
    Cursor,
    OpenCode,
}

/// Metadata for a single session within a project.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    /// Session UUID
    pub id: String,
    /// Human-readable session name (e.g., "async-knitting-panda")
    pub slug: Option<String>,
    /// Most recent summary of the session work
    pub summary: Option<String>,
    /// Model used (e.g., "claude-opus-4-5-20251101")
    pub model: Option<String>,
    /// Claude Code version
    pub version: Option<String>,
    /// Git branch at time of session
    pub git_branch: Option<String>,
    /// Session start timestamp (ISO 8601)
    pub started_at: Option<String>,
    /// Last activity timestamp (from file modification)
    pub last_activity: String,
    /// Number of messages (user + assistant)
    pub message_count: u32,
}

/// Represents a project with its sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// The agent type that created these sessions
    pub agent_type: AgentType,
    /// Absolute path to the project directory
    pub project_path: String,
    /// Project name (last component of path)
    pub project_name: String,
    /// Number of active sessions (with conversations)
    pub session_count: u32,
    /// Total number of sub-agent sessions
    pub subagent_count: u32,
    /// Most recent activity across all sessions
    pub last_activity: String,
    /// Individual sessions (sorted by last activity, descending)
    pub sessions: Vec<Session>,
}

/// Internal struct for extracting cwd from JSONL entries.
#[derive(Deserialize)]
struct JsonlEntry {
    cwd: Option<String>,
}

/// Get the Claude Code projects directory path.
fn get_claude_projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

/// Check if a project directory name is a temp folder (should be skipped).
fn is_temp_project(name: &str) -> bool {
    name.contains("private-var-folders")
}

/// Extract project path from session file content.
fn extract_project_path_from_content(file_path: &Path) -> Option<String> {
    let file = File::open(file_path).ok()?;
    let reader = BufReader::new(file);

    for line in reader.lines().take(100) {
        let line = line.ok()?;
        if let Ok(entry) = serde_json::from_str::<JsonlEntry>(&line) {
            if entry.cwd.is_some() {
                return entry.cwd;
            }
        }
    }
    None
}

/// Convert SystemTime to ISO 8601 string.
fn system_time_to_iso(time: SystemTime) -> String {
    let duration = time
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();

    // Convert to ISO 8601 format
    let datetime = chrono::DateTime::from_timestamp(secs as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now());
    datetime.to_rfc3339()
}

/// Discover all Claude Code projects and their sessions.
pub fn discover_projects() -> Vec<Project> {
    let projects_dir = match get_claude_projects_dir() {
        Some(p) if p.exists() => p,
        _ => return Vec::new(),
    };

    let mut projects: HashMap<String, Project> = HashMap::new();

    // Iterate through project directories
    let entries = match fs::read_dir(&projects_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let dir_name = match path.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };

        // Skip temp folders and non-user projects
        if is_temp_project(&dir_name) || !dir_name.starts_with("-Users-") {
            continue;
        }

        // Process project directory
        if let Some(project) = process_project_dir(&path) {
            let key = project.project_path.clone();
            projects.insert(key, project);
        }
    }

    // Convert to sorted vec (by last activity, descending)
    let mut result: Vec<Project> = projects.into_values().collect();
    result.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));
    result
}

/// Process a single project directory (lightweight - no file content parsing).
/// Only counts files and uses mtimes for the list view.
fn process_project_dir(dir_path: &Path) -> Option<Project> {
    let entries = fs::read_dir(dir_path).ok()?;

    let mut session_files: Vec<PathBuf> = Vec::new();
    let mut subagent_count = 0u32;
    let mut project_path: Option<String> = None;
    let mut latest_mtime: Option<SystemTime> = None;

    for entry in entries.flatten() {
        let path = entry.path();

        // Only process .jsonl files
        if path.extension().map(|e| e != "jsonl").unwrap_or(true) {
            continue;
        }

        let file_name = match path.file_stem() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };

        // Check if it's an agent (subagent) file
        if file_name.starts_with("agent-") {
            subagent_count += 1;
            continue;
        }

        // Check if it's a UUID-format session file
        if !is_uuid_format(&file_name) {
            continue;
        }

        // Track file mtime (much faster than parsing content)
        if let Ok(metadata) = fs::metadata(&path) {
            if let Ok(mtime) = metadata.modified() {
                if latest_mtime.map_or(true, |latest| mtime > latest) {
                    latest_mtime = Some(mtime);
                }
            }
        }

        session_files.push(path);
    }

    // Try to extract project path from the first session file only
    for path in &session_files {
        if project_path.is_none() {
            project_path = extract_project_path_from_content(path);
            if project_path.is_some() {
                break;
            }
        }
    }

    // If we couldn't find the project path from content, skip this project
    let project_path = project_path?;

    // Extract project name from path
    let project_name = Path::new(&project_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| project_path.clone());

    // Use file mtime for last activity (no content parsing needed)
    let last_activity = latest_mtime
        .map(system_time_to_iso)
        .unwrap_or_else(|| {
            fs::metadata(dir_path)
                .and_then(|m| m.modified())
                .map(system_time_to_iso)
                .unwrap_or_default()
        });

    Some(Project {
        agent_type: AgentType::ClaudeCode,
        project_path,
        project_name,
        session_count: session_files.len() as u32,
        subagent_count,
        last_activity,
        sessions: Vec::new(), // Empty for list view - load on demand via get_project_sessions
    })
}

/// Convert a project path to its encoded directory name.
/// e.g., "/Users/ramos/project" -> "-Users-ramos-project"
fn encode_project_path(project_path: &str) -> String {
    project_path.replace('/', "-")
}

/// Get sessions for a specific project (lightweight - no file content parsing).
/// Only returns session ID and last activity time from file metadata.
pub fn get_sessions_for_project(project_path: &str) -> Vec<Session> {
    let projects_dir = match get_claude_projects_dir() {
        Some(p) if p.exists() => p,
        _ => return Vec::new(),
    };

    // Compute the expected directory name from the project path
    let encoded_name = encode_project_path(project_path);
    let project_dir = projects_dir.join(&encoded_name);

    if !project_dir.exists() {
        return Vec::new();
    }

    let entries = match fs::read_dir(&project_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut sessions: Vec<Session> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();

        if path.extension().map(|e| e != "jsonl").unwrap_or(true) {
            continue;
        }

        let file_name = match path.file_stem() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };

        // Skip agent files and non-UUID files
        if file_name.starts_with("agent-") || !is_uuid_format(&file_name) {
            continue;
        }

        // Get file modification time for last_activity (no content parsing!)
        let last_activity = fs::metadata(&path)
            .and_then(|m| m.modified())
            .map(system_time_to_iso)
            .unwrap_or_default();

        sessions.push(Session {
            id: file_name,
            slug: None,
            summary: None,
            model: None,
            version: None,
            git_branch: None,
            started_at: None,
            last_activity,
            message_count: 0,
        });
    }

    // Sort by last activity descending
    sessions.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));
    sessions
}

/// Check if a string looks like a UUID (8-4-4-4-12 format).
fn is_uuid_format(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 5 {
        return false;
    }

    let expected_lens = [8, 4, 4, 4, 12];
    for (part, expected_len) in parts.iter().zip(expected_lens.iter()) {
        if part.len() != *expected_len {
            return false;
        }
        if !part.chars().all(|c| c.is_ascii_hexdigit()) {
            return false;
        }
    }
    true
}

// =============================================================================
// File Edit Extraction
// =============================================================================

/// Type of edit made to a file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileEditType {
    Added,
    Modified,
    Deleted,
}

/// A file that was edited during a session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEdit {
    /// Relative path from project root
    pub path: String,
    /// Type of edit
    pub edit_type: FileEditType,
    /// Timestamp of the last edit to this file (ISO 8601)
    pub last_edited_at: Option<String>,
}

/// A single diff operation on a file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    /// The text that was replaced (empty for Write operations)
    pub old_string: String,
    /// The new text
    pub new_string: String,
    /// Sequence number for ordering diffs
    pub sequence: u32,
    /// Timestamp of the change (ISO 8601)
    pub timestamp: Option<String>,
}

/// All diffs for a specific file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWithDiffs {
    /// Absolute file path
    pub file_path: String,
    /// Relative path from project root
    pub relative_path: String,
    /// Type of edit
    pub edit_type: FileEditType,
    /// All diffs in order
    pub diffs: Vec<FileDiff>,
}

/// Internal struct for parsing JSONL entries to extract tool_use.
#[derive(Deserialize)]
struct JsonlToolEntry {
    #[serde(rename = "type")]
    entry_type: Option<String>,
    message: Option<JsonlMessage>,
    timestamp: Option<String>,
}

#[derive(Deserialize)]
struct JsonlMessage {
    content: Option<Vec<JsonlContent>>,
}

#[derive(Deserialize)]
struct JsonlContent {
    #[serde(rename = "type")]
    content_type: Option<String>,
    name: Option<String>,
    input: Option<Value>,
}

/// Get the session file path for a project and session ID.
fn get_session_file_path(project_path: &str, session_id: &str) -> Option<PathBuf> {
    let projects_dir = get_claude_projects_dir()?;
    let encoded_name = encode_project_path(project_path);
    let session_file = projects_dir
        .join(&encoded_name)
        .join(format!("{}.jsonl", session_id));

    if session_file.exists() {
        Some(session_file)
    } else {
        None
    }
}

/// Get the sub-agent session file path for a project and agent ID.
fn get_subagent_file_path(project_path: &str, agent_id: &str) -> Option<PathBuf> {
    let projects_dir = get_claude_projects_dir()?;
    let encoded_name = encode_project_path(project_path);
    let agent_file = projects_dir
        .join(&encoded_name)
        .join(format!("agent-{}.jsonl", agent_id));

    if agent_file.exists() {
        Some(agent_file)
    } else {
        None
    }
}

/// Extract all file edits from a session (lightweight - just file list and types).
pub fn get_session_file_edits(project_path: &str, session_id: &str) -> Vec<FileEdit> {
    let session_file = match get_session_file_path(project_path, session_id) {
        Some(p) => p,
        None => return Vec::new(),
    };

    let file = match File::open(&session_file) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };

    let reader = BufReader::new(file);

    // Track files and whether they existed before (had Edit with old_string)
    let mut file_operations: HashMap<String, FileEditType> = HashMap::new();
    let mut files_with_prior_content: HashSet<String> = HashSet::new();
    let mut file_timestamps: HashMap<String, String> = HashMap::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        // Quick check: skip lines that don't contain tool_use indicators
        if !line.contains("\"tool_use\"") {
            continue;
        }

        let entry: JsonlToolEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Only process assistant messages
        if entry.entry_type.as_deref() != Some("assistant") {
            continue;
        }

        let content = match entry.message.and_then(|m| m.content) {
            Some(c) => c,
            None => continue,
        };

        for item in content {
            if item.content_type.as_deref() != Some("tool_use") {
                continue;
            }

            let tool_name = match &item.name {
                Some(n) => n.as_str(),
                None => continue,
            };

            let input = match &item.input {
                Some(i) => i,
                None => continue,
            };

            let timestamp = entry.timestamp.clone();

            match tool_name {
                "Edit" => {
                    if let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) {
                        let rel_path = make_relative_path(file_path, project_path);

                        // Check if this edit has old_string content (indicates existing file)
                        if let Some(old_str) = input.get("old_string").and_then(|v| v.as_str()) {
                            if !old_str.is_empty() {
                                files_with_prior_content.insert(rel_path.clone());
                            }
                        }

                        // Mark as modified (we'll determine added/modified later)
                        file_operations.insert(rel_path.clone(), FileEditType::Modified);

                        // Track timestamp (always update to get the latest)
                        if let Some(ts) = timestamp {
                            file_timestamps.insert(rel_path, ts);
                        }
                    }
                }
                "Write" => {
                    if let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) {
                        let rel_path = make_relative_path(file_path, project_path);

                        // Write to a file that wasn't previously edited = added
                        // Write to a file that was edited = modified
                        if !file_operations.contains_key(&rel_path) {
                            file_operations.insert(rel_path.clone(), FileEditType::Added);
                        }

                        // Track timestamp (always update to get the latest)
                        if let Some(ts) = timestamp {
                            file_timestamps.insert(rel_path, ts);
                        }
                    }
                }
                // TODO: Could track file deletions via Bash rm commands
                _ => {}
            }
        }
    }

    // Convert to FileEdit vec, determining final edit type
    let mut edits: Vec<FileEdit> = file_operations
        .into_iter()
        .map(|(path, mut edit_type)| {
            // If a file was written but never had prior content, it's "added"
            // If it had prior content (from Edit old_string), it's "modified"
            if edit_type == FileEditType::Modified && !files_with_prior_content.contains(&path) {
                edit_type = FileEditType::Added;
            }
            let last_edited_at = file_timestamps.get(&path).cloned();
            FileEdit {
                path,
                edit_type,
                last_edited_at,
            }
        })
        .collect();

    // Sort by path for consistent display (frontend can re-sort by timestamp for log view)
    edits.sort_by(|a, b| a.path.cmp(&b.path));
    edits
}

/// Get all diffs for a specific file in a session.
pub fn get_file_diffs(project_path: &str, session_id: &str, file_path: &str) -> Vec<FileDiff> {
    let session_file = match get_session_file_path(project_path, session_id) {
        Some(p) => p,
        None => return Vec::new(),
    };

    let file = match File::open(&session_file) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };

    let reader = BufReader::new(file);
    let target_path = make_relative_path(file_path, project_path);
    let mut diffs: Vec<FileDiff> = Vec::new();
    let mut sequence: u32 = 0;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        // Quick check
        if !line.contains("\"tool_use\"") {
            continue;
        }

        let entry: JsonlToolEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };

        if entry.entry_type.as_deref() != Some("assistant") {
            continue;
        }

        let content = match entry.message.and_then(|m| m.content) {
            Some(c) => c,
            None => continue,
        };

        for item in content {
            if item.content_type.as_deref() != Some("tool_use") {
                continue;
            }

            let tool_name = match &item.name {
                Some(n) => n.as_str(),
                None => continue,
            };

            let input = match &item.input {
                Some(i) => i,
                None => continue,
            };

            let entry_path = match input.get("file_path").and_then(|v| v.as_str()) {
                Some(p) => make_relative_path(p, project_path),
                None => continue,
            };

            if entry_path != target_path {
                continue;
            }

            let timestamp = entry.timestamp.clone();

            match tool_name {
                "Edit" => {
                    let old_string = input
                        .get("old_string")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let new_string = input
                        .get("new_string")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    diffs.push(FileDiff {
                        old_string,
                        new_string,
                        sequence,
                        timestamp,
                    });
                    sequence += 1;
                }
                "Write" => {
                    let content = input
                        .get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    diffs.push(FileDiff {
                        old_string: String::new(),
                        new_string: content,
                        sequence,
                        timestamp,
                    });
                    sequence += 1;
                }
                _ => {}
            }
        }
    }

    diffs
}

/// Convert an absolute file path to a relative path from the project root.
fn make_relative_path(file_path: &str, project_path: &str) -> String {
    // Ensure project_path ends without slash for consistent stripping
    let project = project_path.trim_end_matches('/');

    if file_path.starts_with(project) {
        file_path
            .strip_prefix(project)
            .map(|p| p.trim_start_matches('/'))
            .unwrap_or(file_path)
            .to_string()
    } else {
        // If not under project, return as-is
        file_path.to_string()
    }
}

// =============================================================================
// Session Event Log
// =============================================================================

/// Metadata for compaction events.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactMetadata {
    /// Whether compaction was triggered automatically or manually
    pub trigger: String,
    /// Number of tokens before compaction
    pub pre_tokens: u64,
}

/// Response from get_session_events with pagination info.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEventsResponse {
    /// Events for the requested page
    pub events: Vec<SessionEvent>,
    /// Total number of events in the session
    pub total_count: u32,
    /// Current offset
    pub offset: u32,
    /// Whether there are more events after this page
    pub has_more: bool,
}

/// A single event in the session log.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEvent {
    /// Sequence number (line number in file, 0-indexed)
    pub sequence: u32,
    /// Event UUID if present
    pub uuid: Option<String>,
    /// Timestamp (ISO 8601)
    pub timestamp: Option<String>,
    /// Event type: "user", "assistant", "system", "summary"
    pub event_type: String,
    /// Subtype for system events (e.g., "compact_boundary")
    pub subtype: Option<String>,
    /// Tool name if this is a tool_use event
    pub tool_name: Option<String>,
    /// Preview text (truncated content for display)
    pub preview: String,
    /// Byte offset in file for on-demand raw JSON loading
    pub byte_offset: u64,
    /// Compaction metadata (only for compact_boundary events)
    pub compact_metadata: Option<CompactMetadata>,
    /// Summary text (for summary events)
    pub summary: Option<String>,
    /// Logical parent UUID (for linking compaction to summary)
    pub logical_parent_uuid: Option<String>,
    /// Leaf UUID (for summary events)
    pub leaf_uuid: Option<String>,
    /// Agent ID if this event is a sub-agent launch result (from Task tool)
    pub launched_agent_id: Option<String>,
    /// Description of the sub-agent task (from Task tool)
    pub launched_agent_description: Option<String>,
    /// Full prompt given to the sub-agent
    pub launched_agent_prompt: Option<String>,
    /// Whether the sub-agent is running async
    pub launched_agent_is_async: Option<bool>,
    /// Status of the sub-agent launch
    pub launched_agent_status: Option<String>,
}

/// Internal struct for parsing JSONL entries for event log.
#[derive(Deserialize)]
struct JsonlEventEntry {
    #[serde(rename = "type")]
    entry_type: Option<String>,
    subtype: Option<String>,
    uuid: Option<String>,
    timestamp: Option<String>,
    message: Option<JsonlEventMessage>,
    content: Option<String>,
    summary: Option<String>,
    #[serde(rename = "logicalParentUuid")]
    logical_parent_uuid: Option<String>,
    #[serde(rename = "leafUuid")]
    leaf_uuid: Option<String>,
    #[serde(rename = "compactMetadata")]
    compact_metadata: Option<JsonlCompactMetadata>,
    /// Tool use result (contains agentId for Task tool results)
    #[serde(rename = "toolUseResult")]
    tool_use_result: Option<JsonlToolUseResult>,
}

#[derive(Deserialize)]
struct JsonlToolUseResult {
    #[serde(rename = "agentId")]
    agent_id: Option<String>,
    /// Short description of the sub-agent task
    description: Option<String>,
    /// The full prompt given to the sub-agent
    prompt: Option<String>,
    /// Whether the agent is running async
    #[serde(rename = "isAsync")]
    is_async: Option<bool>,
    /// Status of the agent launch
    status: Option<String>,
}

#[derive(Deserialize)]
struct JsonlEventMessage {
    content: Option<Value>,
}

#[derive(Deserialize)]
struct JsonlCompactMetadata {
    trigger: Option<String>,
    #[serde(rename = "preTokens")]
    pre_tokens: Option<u64>,
}

/// Extract a preview from message content.
fn extract_preview_from_content(content: &Value) -> String {
    match content {
        Value::String(s) => truncate_string(s, 500),
        Value::Array(arr) => {
            // Look for text content first, then thinking, then tool_use
            for item in arr {
                if let Some(obj) = item.as_object() {
                    // Check for text type
                    if obj.get("type").and_then(|t| t.as_str()) == Some("text") {
                        if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
                            return truncate_string(text, 500);
                        }
                    }
                }
            }
            // Check for thinking type (extended thinking)
            for item in arr {
                if let Some(obj) = item.as_object() {
                    if obj.get("type").and_then(|t| t.as_str()) == Some("thinking") {
                        if let Some(thinking) = obj.get("thinking").and_then(|t| t.as_str()) {
                            return truncate_string(thinking, 500);
                        }
                    }
                }
            }
            // Check for tool_use - return tool name
            for item in arr {
                if let Some(obj) = item.as_object() {
                    if obj.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                        if let Some(name) = obj.get("name").and_then(|n| n.as_str()) {
                            return format!("[Tool: {}]", name);
                        }
                    }
                    // Check for tool_result
                    if obj.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                        if let Some(content) = obj.get("content").and_then(|c| c.as_str()) {
                            return truncate_string(content, 500);
                        }
                    }
                }
            }
            // Fallback: stringify first item
            arr.first()
                .map(|v| truncate_string(&v.to_string(), 500))
                .unwrap_or_default()
        }
        _ => truncate_string(&content.to_string(), 500),
    }
}

/// Extract tool names and content types from message content.
fn extract_tool_names(content: &Value) -> Option<String> {
    if let Value::Array(arr) = content {
        let mut labels: Vec<String> = Vec::new();

        // Check for thinking blocks
        let has_thinking = arr.iter().any(|item| {
            item.as_object()
                .and_then(|obj| obj.get("type"))
                .and_then(|t| t.as_str())
                == Some("thinking")
        });
        if has_thinking {
            labels.push("thinking".to_string());
        }

        // Collect tool names
        for item in arr {
            if let Some(obj) = item.as_object() {
                if obj.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    if let Some(name) = obj.get("name").and_then(|n| n.as_str()) {
                        labels.push(name.to_string());
                    }
                }
            }
        }

        if !labels.is_empty() {
            return Some(labels.join(", "));
        }
    }
    None
}

/// Truncate string to max length with ellipsis (UTF-8 safe).
fn truncate_string(s: &str, max_chars: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= max_chars {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_chars).collect();
        format!("{}...", truncated)
    }
}

/// Build an index of line byte offsets for a file.
/// Returns Vec of (byte_offset, line_length) for each line.
fn build_line_index(file: &mut File) -> std::io::Result<Vec<(u64, usize)>> {
    use std::io::{BufRead, Seek, SeekFrom};

    file.seek(SeekFrom::Start(0))?;
    let mut reader = BufReader::new(file);
    let mut index = Vec::new();
    let mut offset: u64 = 0;
    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line)?;
        if bytes_read == 0 {
            break;
        }
        index.push((offset, bytes_read));
        offset += bytes_read as u64;
    }

    Ok(index)
}

/// Read a specific line from a file given its byte offset and length.
fn read_line_at_offset(file: &mut File, offset: u64, length: usize) -> std::io::Result<String> {
    use std::io::{Read, Seek, SeekFrom};

    file.seek(SeekFrom::Start(offset))?;
    let mut buffer = vec![0u8; length];
    file.read_exact(&mut buffer)?;

    // Remove trailing newline
    if buffer.last() == Some(&b'\n') {
        buffer.pop();
    }
    if buffer.last() == Some(&b'\r') {
        buffer.pop();
    }

    String::from_utf8(buffer).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

/// Parse a single JSONL line into a SessionEvent.
fn parse_session_event(line: &str, sequence: u32, byte_offset: u64) -> Option<SessionEvent> {
    let entry: JsonlEventEntry = serde_json::from_str(line).ok()?;

    let event_type = entry.entry_type.clone().unwrap_or_else(|| "unknown".to_string());

    // Extract preview based on event type
    let preview = match event_type.as_str() {
        "user" | "assistant" => {
            if let Some(ref msg) = entry.message {
                if let Some(ref content) = msg.content {
                    extract_preview_from_content(content)
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        }
        "system" => entry.content.clone().unwrap_or_default(),
        "summary" => entry.summary.clone().unwrap_or_default(),
        _ => String::new(),
    };

    // Extract tool names for assistant messages
    let tool_name = if event_type == "assistant" {
        entry
            .message
            .as_ref()
            .and_then(|m| m.content.as_ref())
            .and_then(extract_tool_names)
    } else {
        None
    };

    // Extract compact metadata if present
    let compact_metadata = entry.compact_metadata.as_ref().map(|cm| CompactMetadata {
        trigger: cm.trigger.clone().unwrap_or_else(|| "unknown".to_string()),
        pre_tokens: cm.pre_tokens.unwrap_or(0),
    });

    // Extract launched agent data from tool_use_result
    // Both sync and async Task completions include agentId in toolUseResult
    // - Async launch: { agentId, isAsync: true, status: "async_launched", description }
    // - Sync/Async completion: { agentId, status: "completed", prompt, content, ... }
    let tool_result = entry.tool_use_result.as_ref();
    let launched_agent_id = tool_result.and_then(|r| r.agent_id.clone());
    let launched_agent_description = tool_result.and_then(|r| r.description.clone());
    let launched_agent_prompt = tool_result.and_then(|r| r.prompt.clone());
    let launched_agent_is_async = tool_result.and_then(|r| r.is_async);
    let launched_agent_status = tool_result.and_then(|r| r.status.clone());

    Some(SessionEvent {
        sequence,
        uuid: entry.uuid,
        timestamp: entry.timestamp,
        event_type,
        subtype: entry.subtype,
        tool_name,
        preview,
        byte_offset,
        compact_metadata,
        summary: entry.summary,
        logical_parent_uuid: entry.logical_parent_uuid,
        leaf_uuid: entry.leaf_uuid,
        launched_agent_id,
        launched_agent_description,
        launched_agent_prompt,
        launched_agent_is_async,
        launched_agent_status,
    })
}

/// Get paginated events from a session for the log viewer.
/// Events are returned in descending order (newest first).
///
/// Parameters:
/// - offset: Number of events to skip from the newest (default 0)
/// - limit: Maximum events to return (default 200)
pub fn get_session_events(
    project_path: &str,
    session_id: &str,
    offset: Option<u32>,
    limit: Option<u32>,
) -> SessionEventsResponse {
    let empty_response = SessionEventsResponse {
        events: Vec::new(),
        total_count: 0,
        offset: 0,
        has_more: false,
    };

    let session_file = match get_session_file_path(project_path, session_id) {
        Some(p) => p,
        None => return empty_response,
    };

    let mut file = match File::open(&session_file) {
        Ok(f) => f,
        Err(_) => return empty_response,
    };

    // Phase 1: Build line index (fast, no JSON parsing)
    let line_index = match build_line_index(&mut file) {
        Ok(idx) => idx,
        Err(_) => return empty_response,
    };

    let total_count = line_index.len() as u32;
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(200);

    // For descending order, we want the LAST lines first
    // offset=0 means the last `limit` lines
    // offset=100 means skip the last 100, then take `limit` lines

    if offset >= total_count {
        return SessionEventsResponse {
            events: Vec::new(),
            total_count,
            offset,
            has_more: false,
        };
    }

    // Calculate which lines to read (in original file order)
    // For descending: newest (last in file) comes first in result
    let available = total_count - offset;
    let take_count = std::cmp::min(limit, available) as usize;

    // Start from the end, skip `offset`, take `limit`
    // line_index indices: 0, 1, 2, ..., total-1
    // For offset=0, limit=3, total=10: we want lines 9, 8, 7 (indices)
    // start_idx = total - offset - 1 = 9
    // end_idx = total - offset - take_count = 7

    let start_idx = (total_count - offset - 1) as usize;
    let end_idx = if take_count > start_idx + 1 { 0 } else { start_idx + 1 - take_count };

    // Phase 2: Parse only the requested lines (in reverse order for descending)
    let mut events = Vec::with_capacity(take_count);

    for idx in (end_idx..=start_idx).rev() {
        let (byte_offset, line_len) = line_index[idx];

        if let Ok(line) = read_line_at_offset(&mut file, byte_offset, line_len) {
            if let Some(event) = parse_session_event(&line, idx as u32, byte_offset) {
                events.push(event);
            }
        }
    }

    let has_more = (offset + take_count as u32) < total_count;

    SessionEventsResponse {
        events,
        total_count,
        offset,
        has_more,
    }
}

/// Get the raw JSON for a specific event by its byte offset.
pub fn get_event_raw_json(project_path: &str, session_id: &str, byte_offset: u64) -> Option<String> {
    let session_file = get_session_file_path(project_path, session_id)?;
    let mut file = File::open(&session_file).ok()?;

    use std::io::{BufRead, BufReader, Seek, SeekFrom};

    file.seek(SeekFrom::Start(byte_offset)).ok()?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;

    // Remove trailing newline
    if line.ends_with('\n') {
        line.pop();
    }
    if line.ends_with('\r') {
        line.pop();
    }

    Some(line)
}

/// Get paginated events from a sub-agent session for the log viewer.
/// Events are returned in descending order (newest first).
pub fn get_subagent_events(
    project_path: &str,
    agent_id: &str,
    offset: Option<u32>,
    limit: Option<u32>,
) -> SessionEventsResponse {
    let empty_response = SessionEventsResponse {
        events: Vec::new(),
        total_count: 0,
        offset: 0,
        has_more: false,
    };

    let agent_file = match get_subagent_file_path(project_path, agent_id) {
        Some(p) => p,
        None => return empty_response,
    };

    let mut file = match File::open(&agent_file) {
        Ok(f) => f,
        Err(_) => return empty_response,
    };

    // Phase 1: Build line index (fast - no JSON parsing)
    let line_index = match build_line_index(&mut file) {
        Ok(idx) => idx,
        Err(_) => return empty_response,
    };

    let total_count = line_index.len() as u32;
    if total_count == 0 {
        return empty_response;
    }

    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(200);

    if offset >= total_count {
        return SessionEventsResponse {
            events: Vec::new(),
            total_count,
            offset,
            has_more: false,
        };
    }

    let available = total_count - offset;
    let take_count = std::cmp::min(limit, available) as usize;
    let start_idx = (total_count - offset - 1) as usize;
    let end_idx = if take_count > start_idx + 1 { 0 } else { start_idx + 1 - take_count };

    let mut events = Vec::with_capacity(take_count);

    for idx in (end_idx..=start_idx).rev() {
        let (byte_offset, line_len) = line_index[idx];

        if let Ok(line) = read_line_at_offset(&mut file, byte_offset, line_len) {
            if let Some(event) = parse_session_event(&line, idx as u32, byte_offset) {
                events.push(event);
            }
        }
    }

    let has_more = (offset + take_count as u32) < total_count;

    SessionEventsResponse {
        events,
        total_count,
        offset,
        has_more,
    }
}

/// Get the raw JSON for a specific event in a sub-agent session by its byte offset.
pub fn get_subagent_raw_json(project_path: &str, agent_id: &str, byte_offset: u64) -> Option<String> {
    let agent_file = get_subagent_file_path(project_path, agent_id)?;
    let mut file = File::open(&agent_file).ok()?;

    use std::io::{BufRead, BufReader, Seek, SeekFrom};

    file.seek(SeekFrom::Start(byte_offset)).ok()?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;

    // Remove trailing newline
    if line.ends_with('\n') {
        line.pop();
    }
    if line.ends_with('\r') {
        line.pop();
    }

    Some(line)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_is_uuid_format() {
        assert!(is_uuid_format("040f5516-2ff1-4738-8190-2b8248f631de"));
        assert!(!is_uuid_format("agent-01cdb344"));
        assert!(!is_uuid_format("not-a-uuid"));
        assert!(!is_uuid_format(""));
    }

    #[test]
    fn test_is_temp_project() {
        assert!(is_temp_project(
            "-private-var-folders-8s-x9ypf18955j7w6-zgzqtpclr0000gn-T--tmp08X8zw"
        ));
        assert!(!is_temp_project("-Users-ramos-cupcake-cupcake-rego-cupcake-rewrite"));
    }

    #[test]
    fn bench_discover_projects() {
        let start = Instant::now();
        let projects = discover_projects();
        let elapsed = start.elapsed();
        println!(
            "discover_projects: {} projects in {:?}",
            projects.len(),
            elapsed
        );
        // Should complete in under 500ms with optimizations
        assert!(elapsed.as_millis() < 2000, "Too slow: {:?}", elapsed);
    }
}
