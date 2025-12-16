import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiffEditor } from "@monaco-editor/react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import {
  IconChevronRight,
  IconChevronLeft,
  IconLoader2,
  IconGripVertical,
  IconListTree,
  IconList,
  IconColumns2,
  IconLayoutRows,
  IconStack2,
  IconGitCompare,
} from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GitFileDiff } from "@/lib/types";
import {
  buildFileTree,
  formatTimestamp,
  getFileEditIcon,
  getLanguageFromPath,
  useMonacoTheme,
} from "../utils";
import { TreeNodeItem } from "./tree-node";
import type { EditViewerProps, DiffViewMode, FileListMode, DiffContentMode } from "../types";

export function EditViewer({
  projectPath,
  fileEdits,
  fileEditsLoading,
  selectedFile,
  onSelectFile,
  diffs,
  diffsLoading,
}: EditViewerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("split");
  const [fileListMode, setFileListMode] = useState<FileListMode>("log");
  const [diffContentMode, setDiffContentMode] = useState<DiffContentMode>("edits");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const [flashingFiles, setFlashingFiles] = useState<Set<string>>(new Set());
  const [gitDiff, setGitDiff] = useState<GitFileDiff | null>(null);
  const [gitDiffLoading, setGitDiffLoading] = useState(false);
  const [gitDiffError, setGitDiffError] = useState<string | null>(null);
  const [showAllEdits, setShowAllEdits] = useState(false);
  const monacoTheme = useMonacoTheme();

  // Reset showAllEdits when file changes
  useEffect(() => {
    setShowAllEdits(false);
  }, [selectedFile]);

  // Load git diff when switching to "full" mode or when selected file changes
  useEffect(() => {
    if (diffContentMode !== "full" || !selectedFile) {
      setGitDiff(null);
      setGitDiffError(null);
      return;
    }

    async function loadGitDiff() {
      setGitDiffLoading(true);
      setGitDiffError(null);
      try {
        const diff = await invoke<GitFileDiff>("get_git_file_diff", {
          projectPath,
          filePath: selectedFile,
        });
        setGitDiff(diff);
      } catch (err) {
        console.error("Failed to load git diff:", err);
        setGitDiffError(err instanceof Error ? err.message : String(err));
        setGitDiff(null);
      } finally {
        setGitDiffLoading(false);
      }
    }

    loadGitDiff();
  }, [diffContentMode, selectedFile, projectPath]);

  // Track previous timestamps to detect updates
  const prevTimestampsRef = useRef<Map<string, string>>(new Map());

  // Detect file updates and trigger flash animation
  useEffect(() => {
    const newFlashing = new Set<string>();
    const currentTimestamps = new Map<string, string>();

    for (const edit of fileEdits) {
      const ts = edit.lastEditedAt || "";
      currentTimestamps.set(edit.path, ts);

      const prevTs = prevTimestampsRef.current.get(edit.path);
      // Flash if: new file (no prev timestamp) or timestamp changed
      if (prevTs === undefined || (ts && prevTs !== ts)) {
        newFlashing.add(edit.path);
      }
    }

    // Only flash if we had previous data (skip initial load)
    if (newFlashing.size > 0 && prevTimestampsRef.current.size > 0) {
      setFlashingFiles(newFlashing);
      // Clear flash after animation completes (3 flashes = 900ms)
      const timer = setTimeout(() => {
        setFlashingFiles(new Set());
      }, 900);
      // Always update timestamps before returning
      prevTimestampsRef.current = currentTimestamps;
      return () => clearTimeout(timer);
    }

    // Always update timestamps
    prevTimestampsRef.current = currentTimestamps;
  }, [fileEdits]);

  // Expand all folders when file edits change
  useEffect(() => {
    const folders = new Set<string>();
    for (const file of fileEdits) {
      const parts = file.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join("/"));
      }
    }
    setExpandedFolders(folders);
  }, [fileEdits]);

  const tree = buildFileTree(fileEdits);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Get sorted file edits for both collapsed and log views
  const sortedFileEdits = [...fileEdits].sort((a, b) => {
    if (!a.lastEditedAt && !b.lastEditedAt) return 0;
    if (!a.lastEditedAt) return 1;
    if (!b.lastEditedAt) return -1;
    return b.lastEditedAt.localeCompare(a.lastEditedAt);
  });

  return (
    <PanelGroup direction="horizontal" autoSaveId="edit-viewer-layout" className="h-full">
      {/* File tree sidebar */}
      <Panel
        ref={sidebarPanelRef}
        defaultSize={25}
        minSize={3}
        maxSize={50}
        collapsible={true}
        collapsedSize={3}
        onCollapse={() => setSidebarCollapsed(true)}
        onExpand={() => setSidebarCollapsed(false)}
      >
        <div className="h-full flex flex-col">
          {sidebarCollapsed ? (
            // Collapsed view - just icons
            <>
              {/* Expand button */}
              <div className="shrink-0 px-2 py-2 border-b border-border flex items-center justify-center">
                <button
                  onClick={() => sidebarPanelRef.current?.expand()}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Expand sidebar"
                >
                  <IconChevronRight className="size-4" />
                </button>
              </div>
              {/* Icons list */}
              <div className="flex-1 overflow-auto py-1">
                {sortedFileEdits.map((edit) => (
                  <Tooltip key={edit.path}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onSelectFile(edit.path)}
                        className={cn(
                          "w-full flex items-center justify-center py-1.5 transition-colors",
                          selectedFile === edit.path
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted",
                          flashingFiles.has(edit.path) && "animate-flash"
                        )}
                      >
                        {getFileEditIcon(edit.editType)}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs">{edit.path}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </>
          ) : (
            // Expanded view - full sidebar
            <>
              {/* Header with mode switcher */}
              <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <button
                    onClick={() => sidebarPanelRef.current?.collapse()}
                    className="p-0.5 rounded hover:bg-muted transition-colors hover:text-foreground"
                    title="Collapse sidebar"
                  >
                    <IconChevronLeft className="size-3.5" />
                  </button>
                  Changed Files ({fileEdits.length})
                  {fileEditsLoading && <IconLoader2 className="size-3 animate-spin" />}
                </div>
                {/* Mode switcher */}
                <div className="inline-flex rounded-md bg-muted p-0.5 text-[0.65rem]">
                  <button
                    onClick={() => setFileListMode("tree")}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors",
                      fileListMode === "tree"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <IconListTree className="size-3" />
                    Tree
                  </button>
                  <button
                    onClick={() => setFileListMode("log")}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors",
                      fileListMode === "log"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <IconList className="size-3" />
                    Log
                  </button>
                </div>
              </div>

              {/* File list content */}
              <div className="flex-1 overflow-auto">
                {fileEditsLoading && fileEdits.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    Loading file edits...
                  </div>
                ) : fileEdits.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    No file edits in this session
                  </div>
                ) : fileListMode === "tree" ? (
                  <div className="py-2">
                    {tree.map((node) => (
                      <TreeNodeItem
                        key={node.path}
                        node={node}
                        depth={0}
                        selectedFile={selectedFile}
                        expandedFolders={expandedFolders}
                        onSelectFile={onSelectFile}
                        onToggleFolder={toggleFolder}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-1">
                    {sortedFileEdits.map((edit) => {
                      const fileName = edit.path.split("/").pop() || edit.path;
                      const dirPath = edit.path.includes("/")
                        ? edit.path.substring(0, edit.path.lastIndexOf("/"))
                        : "";
                      return (
                        <button
                          key={edit.path}
                          onClick={() => onSelectFile(edit.path)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                            selectedFile === edit.path
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-muted hover:text-foreground",
                            flashingFiles.has(edit.path) && "animate-flash"
                          )}
                        >
                          {getFileEditIcon(edit.editType)}
                          <span className="flex-1 min-w-0 text-left overflow-x-auto whitespace-nowrap scrollbar-none">
                            <span className="font-medium text-foreground">{fileName}</span>
                            {dirPath && (
                              <span className="text-muted-foreground"> | {dirPath}</span>
                            )}
                          </span>
                          {edit.lastEditedAt && (
                            <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                              {formatTimestamp(edit.lastEditedAt)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Panel>

      {/* Resize handle */}
      <PanelResizeHandle className={cn(
        "w-1.5 bg-border hover:bg-primary/50 transition-colors flex items-center justify-center group",
        sidebarCollapsed && "opacity-0 pointer-events-none"
      )}>
        <IconGripVertical className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </PanelResizeHandle>

      {/* Content area */}
      <Panel defaultSize={75} minSize={30}>
        <div className="h-full overflow-auto flex flex-col">
          {selectedFile ? (
            <div className="p-4 flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {selectedFile}
                  {(diffsLoading || gitDiffLoading) && <IconLoader2 className="size-3 animate-spin" />}
                </div>
                {/* Toggle controls */}
                <div className="flex items-center gap-2">
                  {/* Edits/Full toggle */}
                  <div className="inline-flex rounded-md bg-muted p-0.5 text-[0.65rem]">
                    <button
                      onClick={() => setDiffContentMode("edits")}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors",
                        diffContentMode === "edits"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Per-edit diffs"
                    >
                      <IconStack2 className="size-3" />
                      Edits
                    </button>
                    <button
                      onClick={() => setDiffContentMode("full")}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors",
                        diffContentMode === "full"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Full file diff (HEAD vs current)"
                    >
                      <IconGitCompare className="size-3" />
                      Full
                    </button>
                  </div>
                  {/* Split/Unified toggle */}
                  <div className="inline-flex rounded-md bg-muted p-0.5 text-[0.65rem]">
                    <button
                      onClick={() => setDiffViewMode("split")}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors",
                        diffViewMode === "split"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Side-by-side view"
                    >
                      <IconColumns2 className="size-3" />
                      Split
                    </button>
                    <button
                      onClick={() => setDiffViewMode("unified")}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors",
                        diffViewMode === "unified"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Unified view"
                    >
                      <IconLayoutRows className="size-3" />
                      Unified
                    </button>
                  </div>
                </div>
              </div>
              {diffContentMode === "full" ? (
                // Full git diff view
                gitDiffLoading ? (
                  <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                    <IconLoader2 className="size-5 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Loading git diff...</p>
                  </div>
                ) : gitDiffError ? (
                  <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                    <p className="text-sm text-destructive">{gitDiffError}</p>
                  </div>
                ) : gitDiff ? (
                  <div className="border border-border rounded-lg overflow-hidden flex flex-col flex-1">
                    <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium border-b border-border flex items-center justify-between">
                      <span>HEAD vs Current</span>
                      <span className="text-muted-foreground font-normal">
                        {!gitDiff.existsAtHead && "(new file)"}
                        {!gitDiff.existsInWorkdir && "(deleted)"}
                      </span>
                    </div>
                    <DiffEditor
                      height="100%"
                      language={getLanguageFromPath(selectedFile)}
                      original={gitDiff.original}
                      modified={gitDiff.current}
                      theme={monacoTheme}
                      options={{
                        readOnly: true,
                        renderSideBySide: diffViewMode === "split",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 12,
                        lineNumbers: "on",
                        folding: true,
                        wordWrap: "on",
                        diffWordWrap: "on",
                      }}
                      loading={
                        <div className="flex items-center justify-center h-24 text-muted-foreground">
                          <IconLoader2 className="size-4 animate-spin mr-2" />
                          Loading editor...
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                    <p className="text-sm">No git diff available</p>
                  </div>
                )
              ) : (
                // Per-edit diffs view
                diffsLoading ? (
                  <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                    <IconLoader2 className="size-5 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Loading diffs...</p>
                  </div>
                ) : diffs.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                    <p className="text-sm">No diffs found for this file</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const reversedDiffs = [...diffs].reverse();
                      const visibleDiffs = showAllEdits ? reversedDiffs : reversedDiffs.slice(0, 5);
                      const hiddenCount = reversedDiffs.length - 5;

                      return (
                        <>
                          {visibleDiffs.map((diff, index) => {
                            const lineCount = Math.max(
                              diff.oldString.split("\n").length,
                              diff.newString.split("\n").length
                            );
                            const height = Math.min(Math.max(lineCount * 20 + 40, 100), 400);

                            return (
                              <div key={index} className="border border-border rounded-lg overflow-hidden">
                                <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium border-b border-border flex items-center justify-between">
                                  <span>Change {diff.sequence + 1}</span>
                                  {diff.timestamp && (
                                    <span className="text-muted-foreground font-normal">
                                      {formatTimestamp(diff.timestamp)}
                                    </span>
                                  )}
                                </div>
                                <DiffEditor
                                  height={height}
                                  language={getLanguageFromPath(selectedFile)}
                                  original={diff.oldString}
                                  modified={diff.newString}
                                  theme={monacoTheme}
                                  options={{
                                    readOnly: true,
                                    renderSideBySide: diffViewMode === "split",
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    fontSize: 12,
                                    lineNumbers: "on",
                                    folding: false,
                                    wordWrap: "on",
                                    diffWordWrap: "on",
                                  }}
                                  loading={
                                    <div className="flex items-center justify-center h-24 text-muted-foreground">
                                      <IconLoader2 className="size-4 animate-spin mr-2" />
                                      Loading editor...
                                    </div>
                                  }
                                />
                              </div>
                            );
                          })}
                          {!showAllEdits && hiddenCount > 0 && (
                            <button
                              onClick={() => setShowAllEdits(true)}
                              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg hover:bg-muted transition-colors"
                            >
                              Show {hiddenCount} more edit{hiddenCount > 1 ? "s" : ""}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Select a file to view changes</p>
            </div>
          )}
        </div>
      </Panel>
    </PanelGroup>
  );
}
