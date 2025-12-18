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
  /** User type: "external" for actual human input, null/other for system-injected */
  userType: string | null;
  /** Whether this is a compact summary (context continuation) */
  isCompactSummary: boolean | null;
  /** Whether this is a tool result (message.content is array with tool_result) */
  isToolResult: boolean;
  /** Whether this is a meta/context injection (isMeta: true) */
  isMeta: boolean;
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

// =============================================================================
// Policy Evaluation / CupcakeSpan Types
// =============================================================================

/** Summary of a policy evaluation for list display */
export interface PolicyEvaluation {
  /** Filename of the telemetry file */
  filename: string;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** Event type (e.g., "PreToolUse") */
  eventType: string | null;
  /** Tool name (e.g., "Bash") */
  toolName: string | null;
  /** Final decision (e.g., "Allow", "Block") */
  decision: string | null;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Trace ID */
  traceId: string;
}

/** Harness type that generated the event */
export type HarnessType = "ClaudeCode" | "Cursor" | "OpenCode" | "Factory";

/** Final decision type name */
export type FinalDecisionType = "Allow" | "Block" | "Deny" | "Halt" | "Ask" | "Modify";

/** Final decision content for Allow */
export interface AllowDecision {
  context: string[];
}

/** Final decision content for blocking decisions */
export interface BlockingDecision {
  reason: string;
  agent_messages: string[];
}

/** Final decision content for Ask */
export interface AskDecision {
  reason: string;
  agent_messages: string[];
}

/** Final decision content for Modify */
export interface ModifyDecision {
  reason: string;
  updated_input: unknown;
  agent_messages: string[];
}

/** Tagged union final decision from policy evaluation (matches Rust FinalDecision enum) */
export type FinalDecision =
  | { Allow: AllowDecision }
  | { Deny: BlockingDecision }
  | { Block: BlockingDecision }
  | { Halt: BlockingDecision }
  | { Ask: AskDecision }
  | { Modify: ModifyDecision };

/** Helper to extract the decision type from a FinalDecision */
export function getFinalDecisionType(decision: FinalDecision | null): FinalDecisionType | null {
  if (!decision) return null;
  if ("Allow" in decision) return "Allow";
  if ("Deny" in decision) return "Deny";
  if ("Block" in decision) return "Block";
  if ("Halt" in decision) return "Halt";
  if ("Ask" in decision) return "Ask";
  if ("Modify" in decision) return "Modify";
  return null;
}

/** A single signal execution result */
export interface SignalExecution {
  /** Signal name */
  name: string;
  /** Command that was executed */
  command: string;
  /** Result value (JSON) */
  result: unknown;
  /** Duration in milliseconds */
  durationMs: number | null;
  /** Exit code if applicable */
  exitCode: number | null;
}

/** Signals phase - contains all signal executions for a policy phase */
export interface SignalsPhase {
  /** Span ID */
  spanId: string;
  /** Parent span ID (the PolicyPhase) */
  parentSpanId: string;
  /** Start time in nanoseconds since Unix epoch */
  startTimeUnixNano: number;
  /** End time in nanoseconds since Unix epoch */
  endTimeUnixNano: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** List of signal executions */
  signals: SignalExecution[];
}

/** A single decision result (halt, deny, block, ask, etc.) */
export interface DecisionResult {
  /** Rule ID that triggered this decision */
  ruleId: string;
  /** Reason for the decision */
  reason: string;
  /** Severity level */
  severity: string;
}

/** WASM decision set from policy evaluation */
export interface DecisionSet {
  /** Halt decisions (immediate stop) */
  halts: DecisionResult[];
  /** Denial decisions */
  denials: DecisionResult[];
  /** Block decisions */
  blocks: DecisionResult[];
  /** Ask decisions (require user confirmation) */
  asks: DecisionResult[];
  /** Modifications to apply */
  modifications: unknown[];
  /** Context to add */
  addContext: unknown[];
}

/** Evaluation result for a policy phase */
export interface EvaluationResult {
  /** Span ID */
  spanId: string;
  /** Parent span ID */
  parentSpanId: string;
  /** Start time in nanoseconds since Unix epoch */
  startTimeUnixNano: number;
  /** End time in nanoseconds since Unix epoch */
  endTimeUnixNano: number;
  /** Whether the event was routed to policies */
  routed: boolean;
  /** Names of policies that matched */
  matchedPolicies: string[];
  /** Reason for early exit if applicable */
  exitReason: string | null;
  /** WASM decision set */
  wasmDecisionSet: DecisionSet | null;
  /** Final decision for this phase */
  finalDecision: FinalDecision | null;
  /** Duration in milliseconds */
  durationMs: number;
}

/** A single policy evaluation phase (global, catalog, project) */
export interface PolicyPhase {
  /** Span ID */
  spanId: string;
  /** Parent span ID (the root CupcakeSpan) */
  parentSpanId: string;
  /** Start time in nanoseconds since Unix epoch */
  startTimeUnixNano: number;
  /** End time in nanoseconds since Unix epoch */
  endTimeUnixNano: number;
  /** Phase name (e.g., "global", "project", "catalog:xyz") */
  name: string;
  /** Signals phase (optional) */
  signals: SignalsPhase | null;
  /** Evaluation result */
  evaluation: EvaluationResult;
  /** Duration in milliseconds */
  durationMs: number;
}

/** Enrichment phase - preprocessing/normalization */
export interface EnrichPhase {
  /** Span ID */
  spanId: string;
  /** Parent span ID */
  parentSpanId: string;
  /** Start time in nanoseconds since Unix epoch */
  startTimeUnixNano: number;
  /** End time in nanoseconds since Unix epoch */
  endTimeUnixNano: number;
  /** Enriched event data */
  enrichedEvent: Record<string, unknown>;
  /** Operations performed */
  operations: string[];
  /** Duration in microseconds */
  durationUs: number;
}

/** Root span for a complete policy evaluation */
export interface CupcakeSpan {
  /** Span ID */
  spanId: string;
  /** Trace ID */
  traceId: string;
  /** Start time in nanoseconds since Unix epoch */
  startTimeUnixNano: number;
  /** End time in nanoseconds since Unix epoch */
  endTimeUnixNano: number;
  /** Raw input event */
  rawEvent: Record<string, unknown>;
  /** Harness that generated the event */
  harness: HarnessType;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** Enrichment phase (optional) */
  enrich: EnrichPhase | null;
  /** Policy evaluation phases */
  phases: PolicyPhase[];
  /** Final response */
  response: Record<string, unknown> | null;
  /** Errors encountered */
  errors: string[];
  /** Total duration in milliseconds */
  totalDurationMs: number;
}

// =============================================================================
// Search Types
// =============================================================================

/** A single search match result */
export interface SearchMatch {
  /** Line number (0-indexed, same as event sequence) */
  sequence: number;
  /** Byte offset in file for loading full JSON */
  byteOffset: number;
  /** Snippet of text showing match context */
  snippet: string;
}

/** Search response from backend */
export interface SearchResponse {
  /** Matching line indices */
  matches: SearchMatch[];
  /** Total lines searched */
  totalSearched: number;
  /** Whether search was truncated (hit max_results limit) */
  truncated: boolean;
}
