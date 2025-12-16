import type { FileEdit, FileDiff, FileEditType, SessionEvent } from "@/lib/types";

export type TabId = "events" | "edits";
export type DiffViewMode = "split" | "unified";
export type FileListMode = "tree" | "log";
export type DiffContentMode = "edits" | "full";

// Tree node for hierarchical display
export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  editType?: FileEditType;
  children: TreeNode[];
}

export interface ProjectDetailPageProps {
  projectPath: string;
}

export interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  expandedFolders: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
}

export interface EditViewerProps {
  projectPath: string;
  fileEdits: FileEdit[];
  fileEditsLoading: boolean;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  diffs: FileDiff[];
  diffsLoading: boolean;
}

export interface EventLogViewerProps {
  events: SessionEvent[];
  loading: boolean;
  loadingMore: boolean;
  filter: string;
  onFilterChange: (filter: string) => void;
  summaryMap: Map<string, string>;
  onLoadMore: () => void;
  totalCount: number;
  hasMore: boolean;
  projectPath: string;
  sessionId: string;
  selectedSubagentId: string | null;
  onSelectSubagent: (agentId: string | null) => void;
}

export interface JsonViewerProps {
  data: unknown;
  label?: string;
  defaultExpanded?: boolean;
  isRoot?: boolean;
}

// EventRow component for react-window v2
// Base props passed via rowProps (without index/style which react-window injects)
export interface EventRowBaseProps {
  events: SessionEvent[];
  onSelectEvent: (event: SessionEvent) => void;
  onSelectSubagent: (agentId: string) => void;
  summaryMap: Map<string, string>;
  selectedSubagentId: string | null;
}

// Full props received by the component (includes react-window injected props)
export interface EventRowProps extends EventRowBaseProps {
  index: number;
  style: React.CSSProperties;
}
