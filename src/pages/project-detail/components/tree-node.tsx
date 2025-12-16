import {
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconFolderOpen,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { getFileEditIcon } from "../utils";
import type { TreeNodeItemProps } from "../types";

export function TreeNodeItem({
  node,
  depth,
  selectedFile,
  expandedFolders,
  onSelectFile,
  onToggleFolder,
}: TreeNodeItemProps) {
  const isExpanded = expandedFolders.has(node.path);
  const paddingLeft = depth * 12 + 8;

  if (node.type === "folder") {
    return (
      <>
        <button
          onClick={() => onToggleFolder(node.path)}
          className="w-full flex items-center gap-1 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <IconChevronDown className="size-3.5 shrink-0" />
          ) : (
            <IconChevronRight className="size-3.5 shrink-0" />
          )}
          {isExpanded ? (
            <IconFolderOpen className="size-3.5 shrink-0 text-blue-400" />
          ) : (
            <IconFolder className="size-3.5 shrink-0 text-blue-400" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded &&
          node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              expandedFolders={expandedFolders}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
            />
          ))}
      </>
    );
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "w-full flex items-center gap-1 py-1 text-xs transition-colors",
        selectedFile === node.path
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      style={{ paddingLeft: paddingLeft + 16 }}
    >
      {node.editType && getFileEditIcon(node.editType)}
      <span className="truncate">{node.name}</span>
    </button>
  );
}
