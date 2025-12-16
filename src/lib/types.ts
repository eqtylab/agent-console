/**
 * Types for agent session data.
 * These match the Rust structures in src-tauri/src/claude_code.rs
 */

export type AgentType = "claude-code" | "cursor" | "opencode";

export interface Session {
  /** Session UUID */
  id: string;
  /** Human-readable session name (e.g., "async-knitting-panda") */
  slug: string | null;
  /** Most recent summary of the session work */
  summary: string | null;
  /** Model used (e.g., "claude-opus-4-5-20251101") */
  model: string | null;
  /** Claude Code version */
  version: string | null;
  /** Git branch at time of session */
  gitBranch: string | null;
  /** Session start timestamp (ISO 8601) */
  startedAt: string | null;
  /** Last activity timestamp (ISO 8601) */
  lastActivity: string;
  /** Number of messages (user + assistant) */
  messageCount: number;
}

export interface Project {
  /** The agent type that created these sessions */
  agentType: AgentType;
  /** Absolute path to the project directory */
  projectPath: string;
  /** Project name (last component of path) */
  projectName: string;
  /** Number of active sessions (with conversations) */
  sessionCount: number;
  /** Total number of sub-agent sessions */
  subagentCount: number;
  /** Most recent activity across all sessions */
  lastActivity: string;
  /** Individual sessions (sorted by last activity, descending) */
  sessions: Session[];
}

export interface ActiveSessionsResult {
  /** Whether this feature is supported on the current platform */
  supported: boolean;
  /** Set of project paths with active Claude sessions */
  activePaths: string[];
}

export type TerminalType =
  | "macos-terminal"
  | "ghostty"
  | "iterm2"
  | "windows-terminal"
  | "gnome-terminal"
  | "konsole"
  | "alacritty";

export const terminalDisplayNames: Record<TerminalType, string> = {
  "macos-terminal": "Terminal",
  ghostty: "Ghostty",
  iterm2: "iTerm2",
  "windows-terminal": "Windows Terminal",
  "gnome-terminal": "GNOME Terminal",
  konsole: "Konsole",
  alacritty: "Alacritty",
};

// File edit types - matches Rust structs in claude_code.rs
export type FileEditType = "added" | "modified" | "deleted";

export interface FileEdit {
  /** Relative path from project root */
  path: string;
  /** Type of edit */
  editType: FileEditType;
  /** Timestamp of the last edit to this file (ISO 8601) */
  lastEditedAt: string | null;
}

export interface FileDiff {
  /** The text that was replaced (empty for Write operations) */
  oldString: string;
  /** The new text */
  newString: string;
  /** Sequence number for ordering diffs */
  sequence: number;
  /** Timestamp of the change (ISO 8601) */
  timestamp: string | null;
}

export interface GitFileDiff {
  /** Content of the file at HEAD (original) */
  original: string;
  /** Current content of the file in working directory */
  current: string;
  /** Whether the file exists at HEAD */
  existsAtHead: boolean;
  /** Whether the file exists in working directory */
  existsInWorkdir: boolean;
}

// Session Event Log types

/** Metadata for compaction events */
export interface CompactMetadata {
  /** Whether compaction was triggered automatically or manually */
  trigger: string;
  /** Number of tokens before compaction */
  preTokens: number;
}

/** A single event in the session log */
export interface SessionEvent {
  /** Sequence number (line number in file, 0-indexed) */
  sequence: number;
  /** Event UUID if present */
  uuid: string | null;
  /** Timestamp (ISO 8601) */
  timestamp: string | null;
  /** Event type: "user", "assistant", "system", "summary" */
  eventType: string;
  /** Subtype for system events (e.g., "compact_boundary") */
  subtype: string | null;
  /** Tool name if this is a tool_use event */
  toolName: string | null;
  /** Preview text (truncated content for display) */
  preview: string;
  /** Byte offset in file for on-demand raw JSON loading */
  byteOffset: number;
  /** Compaction metadata (only for compact_boundary events) */
  compactMetadata: CompactMetadata | null;
  /** Summary text (for summary events) */
  summary: string | null;
  /** Logical parent UUID (for linking compaction to summary) */
  logicalParentUuid: string | null;
  /** Leaf UUID (for summary events) */
  leafUuid: string | null;
  /** Agent ID if this event is a sub-agent launch result (from Task tool) */
  launchedAgentId: string | null;
  /** Description of the sub-agent task (from Task tool) */
  launchedAgentDescription: string | null;
  /** Full prompt given to the sub-agent */
  launchedAgentPrompt: string | null;
  /** Whether the sub-agent is running async */
  launchedAgentIsAsync: boolean | null;
  /** Status of the sub-agent launch */
  launchedAgentStatus: string | null;
}

/** Paginated response for session events */
export interface SessionEventsResponse {
  /** Events for the requested page */
  events: SessionEvent[];
  /** Total number of events in the session */
  totalCount: number;
  /** Current offset */
  offset: number;
  /** Whether there are more events after this page */
  hasMore: boolean;
}
