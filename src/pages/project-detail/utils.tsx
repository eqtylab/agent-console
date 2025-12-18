import {
  IconPlus,
  IconMinus,
  IconPlusMinus,
} from "@tabler/icons-react";
import { useTheme } from "@/components/theme-provider";
import type { FileEdit, FileEditType, SessionEvent } from "@/lib/types";
import type { TreeNode } from "./types";

// Map file extensions to Monaco language identifiers
export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    rs: "rust",
    py: "python",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ps1: "powershell",
    dockerfile: "dockerfile",
    toml: "toml",
    ini: "ini",
    conf: "ini",
    rego: "rego",
  };
  return languageMap[ext] || "plaintext";
}

// Build tree structure from flat file paths
export function buildFileTree(files: FileEdit[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");

      let existing = currentLevel.find((n) => n.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "folder",
          editType: isFile ? file.editType : undefined,
          children: [],
        };
        currentLevel.push(existing);
      }

      if (!isFile) {
        currentLevel = existing.children;
      }
    }
  }

  // Sort: folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => ({
        ...node,
        children: sortNodes(node.children),
      }));
  };

  return sortNodes(root);
}

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

export function truncateUuid(uuid: string): string {
  return uuid.slice(0, 8);
}

export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function getFileEditIcon(editType: FileEditType) {
  switch (editType) {
    case "added":
      return <IconPlus className="size-3.5 shrink-0 text-green-500" />;
    case "modified":
      return <IconPlusMinus className="size-3.5 shrink-0 text-yellow-500" />;
    case "deleted":
      return <IconMinus className="size-3.5 shrink-0 text-red-500" />;
  }
}

// Resolve theme to Monaco theme
export function useMonacoTheme(): "vs" | "vs-dark" {
  const { theme } = useTheme();
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "vs";
  }
  return theme === "dark" ? "vs-dark" : "vs";
}

// Get display label for event type
// Distinguishes between actual human input ("me") vs system-injected ("context")
export function getEventDisplayLabel(event: SessionEvent): string {
  if (event.subtype === "compact_boundary") {
    return "compaction";
  }
  if (event.eventType === "user") {
    // System-injected messages (not actual human input):
    // 1. Compact summaries (isCompactSummary: true)
    // 2. Meta/context injections (isMeta: true)
    // 3. Tool results (isToolResult: true - message.content is array with tool_result)
    // 4. Command notifications (preview starts with <command-message>)
    if (event.isCompactSummary || event.isMeta || event.isToolResult) {
      return "context";
    }
    // Check for command notifications (starts with <command-message>)
    if (event.preview?.startsWith("<command-message>")) {
      return "context";
    }
    // Actual human input has userType: "external" and none of the above
    if (event.userType === "external") {
      return "me";
    }
    // Other system-injected user messages
    return "context";
  }
  return event.eventType;
}

// Get badge color for event type
export function getEventBadgeClass(event: SessionEvent): string {
  if (event.subtype === "compact_boundary") {
    return "bg-amber-500/20 text-amber-600 dark:text-amber-400";
  }
  if (event.eventType === "user") {
    // Use the same logic as getEventDisplayLabel to determine me vs context
    const label = getEventDisplayLabel(event);
    if (label === "me") {
      // Actual human input - bright blue
      return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
    }
    // System-injected context - muted gray/slate
    return "bg-slate-500/20 text-slate-600 dark:text-slate-400";
  }
  switch (event.eventType) {
    case "assistant":
      return "bg-purple-500/20 text-purple-600 dark:text-purple-400";
    case "system":
      return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400";
    case "summary":
      return "bg-green-500/20 text-green-600 dark:text-green-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Format timestamp for display: 2025-01-28 12:53:06.082 EST
export function formatEventTime(timestamp: string | null): string {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    const s = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");

    // Get timezone abbreviation
    const tz = date.toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop() || "";

    return `${year}-${month}-${day} ${h}:${m}:${s}.${ms} ${tz}`;
  } catch {
    return "";
  }
}
