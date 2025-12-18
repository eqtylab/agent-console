import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { List, type ListImperativeAPI } from "react-window";
import {
  IconChevronDown,
  IconCopy,
  IconCheck,
  IconLoader2,
  IconSearch,
  IconStack2,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionEventsResponse } from "@/lib/types";
import { getEventBadgeClass } from "../utils";
import type { EventLogViewerProps, EventRowBaseProps } from "../types";
import { EventRowComponent } from "./event-row";
import { JsonViewerRoot } from "./json-viewer";

export function EventLogViewer({
  events,
  loading,
  loadingMore,
  filter,
  onFilterChange,
  filterMode,
  onFilterModeChange,
  highlightedIndices,
  summaryMap,
  onLoadMore,
  totalCount,
  hasMore,
  projectPath,
  sessionId,
  selectedSubagentId,
  onSelectSubagent,
  searchQuery,
  onSearchChange,
  searchLoading,
  searchResults,
  snippetMap,
}: EventLogViewerProps) {
  const listRef = useRef<ListImperativeAPI>(null);
  const subagentListRef = useRef<ListImperativeAPI>(null);
  const mainPanelRef = useRef<ImperativePanelHandle>(null);
  const subagentPanelRef = useRef<ImperativePanelHandle>(null);
  const jsonPanelRef = useRef<ImperativePanelHandle>(null);

  // Main event JSON viewer state
  const [selectedEvent, setSelectedEvent] = useState<typeof events[0] | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [rawJsonLoading, setRawJsonLoading] = useState(false);

  // Sub-agent events state
  const [subagentEvents, setSubagentEvents] = useState<typeof events>([]);
  const [subagentLoading, setSubagentLoading] = useState(false);
  const [subagentTotalCount, setSubagentTotalCount] = useState(0);
  const [subagentHasMore, setSubagentHasMore] = useState(false);
  const [subagentLoadingMore, setSubagentLoadingMore] = useState(false);
  const [subagentSelectedEvent, setSubagentSelectedEvent] = useState<typeof events[0] | null>(null);
  const [subagentRawJson, setSubagentRawJson] = useState<string | null>(null);
  const [subagentRawJsonLoading, setSubagentRawJsonLoading] = useState(false);
  const [subagentPromptExpanded, setSubagentPromptExpanded] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  // Flash animation state for new events
  const [flashingByteOffsets, setFlashingByteOffsets] = useState<Set<number>>(new Set());
  const [subagentFlashingByteOffsets, setSubagentFlashingByteOffsets] = useState<Set<number>>(new Set());
  const prevByteOffsetsRef = useRef<Set<number>>(new Set());
  const prevSubagentByteOffsetsRef = useRef<Set<number>>(new Set());

  const rowHeight = 32;

  // Handle rows rendered to detect when near bottom for infinite loading
  const handleRowsRendered = useCallback(
    (
      _visibleRows: { startIndex: number; stopIndex: number },
      allRows: { startIndex: number; stopIndex: number }
    ) => {
      if (loadingMore || !hasMore) return;

      // Load more when within 5 rows of the end
      if (allRows.stopIndex >= events.length - 5) {
        onLoadMore();
      }
    },
    [loadingMore, hasMore, events.length, onLoadMore]
  );

  // Load raw JSON when dialog opens
  useEffect(() => {
    if (selectedEvent) {
      setRawJsonLoading(true);
      setRawJson(null);
      invoke<string | null>("get_event_raw_json", {
        projectPath,
        sessionId,
        byteOffset: selectedEvent.byteOffset,
      })
        .then((json) => setRawJson(json ?? "{}"))
        .catch(() => setRawJson("Error loading JSON"))
        .finally(() => setRawJsonLoading(false));
    }
  }, [selectedEvent, projectPath, sessionId]);

  // Load sub-agent events when selected
  const loadSubagentEvents = useCallback(async () => {
    if (!selectedSubagentId) return;

    setSubagentLoading(true);
    try {
      const response = await invoke<SessionEventsResponse>("get_subagent_events", {
        projectPath,
        agentId: selectedSubagentId,
        offset: 0,
        limit: 200,
      });
      setSubagentEvents(response.events);
      setSubagentTotalCount(response.totalCount);
      setSubagentHasMore(response.hasMore);
    } catch (err) {
      console.error("Failed to load sub-agent events:", err);
      setSubagentEvents([]);
    } finally {
      setSubagentLoading(false);
    }
  }, [projectPath, selectedSubagentId]);

  // Load more sub-agent events
  const loadMoreSubagentEvents = useCallback(async () => {
    if (!selectedSubagentId || subagentLoadingMore || !subagentHasMore) return;

    setSubagentLoadingMore(true);
    try {
      const response = await invoke<SessionEventsResponse>("get_subagent_events", {
        projectPath,
        agentId: selectedSubagentId,
        offset: subagentEvents.length,
        limit: 200,
      });
      setSubagentEvents((prev) => [...prev, ...response.events]);
      setSubagentHasMore(response.hasMore);
    } catch (err) {
      console.error("Failed to load more sub-agent events:", err);
    } finally {
      setSubagentLoadingMore(false);
    }
  }, [projectPath, selectedSubagentId, subagentEvents.length, subagentLoadingMore, subagentHasMore]);

  // Handle sub-agent rows rendered for infinite scrolling
  const handleSubagentRowsRendered = useCallback(
    (
      _visibleRows: { startIndex: number; stopIndex: number },
      allRows: { startIndex: number; stopIndex: number }
    ) => {
      if (subagentLoadingMore || !subagentHasMore) return;
      if (allRows.stopIndex >= subagentEvents.length - 5) {
        loadMoreSubagentEvents();
      }
    },
    [subagentLoadingMore, subagentHasMore, subagentEvents.length, loadMoreSubagentEvents]
  );

  // Load sub-agent events when selected
  useEffect(() => {
    if (selectedSubagentId) {
      loadSubagentEvents();
      setSubagentPromptExpanded(false); // Reset prompt expansion when switching sub-agents
    } else {
      setSubagentEvents([]);
      setSubagentTotalCount(0);
      setSubagentHasMore(false);
    }
  }, [selectedSubagentId, loadSubagentEvents]);

  // Unified panel layout management - resize all panels together to maintain valid percentages
  // Layout states:
  // - Only main: main=100, subagent=0, json=0
  // - Main + subagent: main=60, subagent=40, json=0
  // - Main + json: main=60, subagent=0, json=40
  // - Main + subagent + json: main=34, subagent=33, json=33
  useEffect(() => {
    const hasSubagent = !!selectedSubagentId;
    const hasJson = !!(selectedEvent || subagentSelectedEvent);

    if (hasSubagent && hasJson) {
      // Three panels: main + subagent + json
      mainPanelRef.current?.resize(34);
      subagentPanelRef.current?.resize(33);
      jsonPanelRef.current?.resize(33);
    } else if (hasSubagent) {
      // Two panels: main + subagent
      mainPanelRef.current?.resize(60);
      subagentPanelRef.current?.resize(40);
      jsonPanelRef.current?.collapse();
    } else if (hasJson) {
      // Two panels: main + json
      mainPanelRef.current?.resize(60);
      subagentPanelRef.current?.collapse();
      jsonPanelRef.current?.resize(40);
    } else {
      // One panel: main only
      mainPanelRef.current?.resize(100);
      subagentPanelRef.current?.collapse();
      jsonPanelRef.current?.collapse();
    }
  }, [selectedSubagentId, selectedEvent, subagentSelectedEvent]);

  // Watch/unwatch sub-agent file for real-time updates
  useEffect(() => {
    if (!selectedSubagentId) return;

    let unlisten: (() => void) | null = null;

    async function setupWatcher() {
      try {
        await invoke("watch_subagent", {
          projectPath,
          agentId: selectedSubagentId,
        });
      } catch (err) {
        console.error("Failed to start sub-agent watcher:", err);
      }

      unlisten = await listen<{ projectPath: string; agentId: string }>(
        "subagent-changed",
        (event) => {
          if (
            event.payload.projectPath === projectPath &&
            event.payload.agentId === selectedSubagentId
          ) {
            loadSubagentEvents();
          }
        }
      );
    }

    setupWatcher();

    return () => {
      if (unlisten) {
        unlisten();
      }
      invoke("unwatch_subagent", {
        projectPath,
        agentId: selectedSubagentId,
      }).catch((err) => {
        console.error("Failed to stop sub-agent watcher:", err);
      });
    };
  }, [projectPath, selectedSubagentId, loadSubagentEvents]);

  // Load sub-agent raw JSON when dialog opens
  useEffect(() => {
    if (subagentSelectedEvent && selectedSubagentId) {
      setSubagentRawJsonLoading(true);
      setSubagentRawJson(null);
      invoke<string | null>("get_subagent_raw_json", {
        projectPath,
        agentId: selectedSubagentId,
        byteOffset: subagentSelectedEvent.byteOffset,
      })
        .then((json) => setSubagentRawJson(json ?? "{}"))
        .catch(() => setSubagentRawJson("Error loading JSON"))
        .finally(() => setSubagentRawJsonLoading(false));
    }
  }, [subagentSelectedEvent, projectPath, selectedSubagentId]);

  // Detect new main events and trigger flash animation
  useEffect(() => {
    const currentOffsets = new Set(events.map((e) => e.byteOffset));
    const newFlashing = new Set<number>();

    // Find events that weren't in the previous set
    for (const offset of currentOffsets) {
      if (!prevByteOffsetsRef.current.has(offset)) {
        newFlashing.add(offset);
      }
    }

    // Update ref BEFORE any early return so we don't keep detecting same events as new
    const hadPreviousData = prevByteOffsetsRef.current.size > 0;
    prevByteOffsetsRef.current = currentOffsets;

    // Only flash if we had previous data (skip initial load)
    if (newFlashing.size > 0 && hadPreviousData) {
      setFlashingByteOffsets(newFlashing);
      // Clear flash after animation completes (3 flashes = 900ms)
      const timer = setTimeout(() => {
        setFlashingByteOffsets(new Set());
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [events]);

  // Detect new sub-agent events and trigger flash animation
  useEffect(() => {
    const currentOffsets = new Set(subagentEvents.map((e) => e.byteOffset));
    const newFlashing = new Set<number>();

    // Find events that weren't in the previous set
    for (const offset of currentOffsets) {
      if (!prevSubagentByteOffsetsRef.current.has(offset)) {
        newFlashing.add(offset);
      }
    }

    // Update ref BEFORE any early return so we don't keep detecting same events as new
    const hadPreviousData = prevSubagentByteOffsetsRef.current.size > 0;
    prevSubagentByteOffsetsRef.current = currentOffsets;

    // Only flash if we had previous data (skip initial load)
    if (newFlashing.size > 0 && hadPreviousData) {
      setSubagentFlashingByteOffsets(newFlashing);
      // Clear flash after animation completes (3 flashes = 900ms)
      const timer = setTimeout(() => {
        setSubagentFlashingByteOffsets(new Set());
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [subagentEvents]);

  // Handler for selecting a main event - closes subagent panel, opens JSON viewer
  const handleSelectMainEvent = useCallback((event: typeof events[0]) => {
    // Close subagent panel if open
    if (selectedSubagentId) {
      onSelectSubagent(null);
    }
    // Clear any subagent event selection
    setSubagentSelectedEvent(null);
    setSubagentRawJson(null);
    // Set the main event
    setSelectedEvent(event);
  }, [selectedSubagentId, onSelectSubagent]);

  // Handler for selecting a subagent - closes main JSON viewer, opens subagent panel
  const handleSelectSubagent = useCallback((agentId: string | null) => {
    // Close main event JSON viewer if open
    setSelectedEvent(null);
    setRawJson(null);
    // Clear subagent event selection when switching subagents
    if (agentId !== selectedSubagentId) {
      setSubagentSelectedEvent(null);
      setSubagentRawJson(null);
    }
    // Set the subagent
    onSelectSubagent(agentId);
  }, [selectedSubagentId, onSelectSubagent]);

  const rowProps = useMemo(
    () => ({
      events,
      onSelectEvent: handleSelectMainEvent,
      onSelectSubagent: handleSelectSubagent,
      summaryMap,
      selectedSubagentId,
      highlightedIndices,
      flashingByteOffsets,
      snippetMap,
      searchQuery,
    }),
    [events, summaryMap, handleSelectMainEvent, handleSelectSubagent, selectedSubagentId, highlightedIndices, flashingByteOffsets, snippetMap, searchQuery]
  );

  const subagentRowProps = useMemo(
    () => ({
      events: subagentEvents,
      onSelectEvent: setSubagentSelectedEvent,
      onSelectSubagent: () => {}, // No nested sub-agent selection
      summaryMap: new Map<string, string>(),
      selectedSubagentId: null,
      flashingByteOffsets: subagentFlashingByteOffsets,
    }),
    [subagentEvents, subagentFlashingByteOffsets]
  );

  // Main event list component
  const MainEventList = (
    <div className="h-full flex flex-col">
      {/* Filter bar - scrollable when panel is narrow */}
      <div className="shrink-0 px-3 py-2 border-b border-border overflow-x-auto scrollbar-thin">
        <div className="flex items-center justify-between gap-2 min-w-fit">
          <div className="flex items-center gap-1 shrink-0">
            {/* Search input */}
            <div className="relative mr-1">
              <IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search (AND, OR)"
                className={cn(
                  "pl-7 pr-2 py-1 rounded text-[0.65rem] bg-muted/50 border border-transparent",
                  "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20",
                  "placeholder:text-muted-foreground/60 w-36 sm:w-44"
                )}
              />
              {searchLoading && (
                <IconLoader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 animate-spin text-muted-foreground" />
              )}
            </div>
            {searchResults && (
              <span className="text-[0.6rem] text-muted-foreground whitespace-nowrap mr-1">
                {searchResults.matches.length.toLocaleString()}{searchResults.truncated && "+"}
              </span>
            )}
            {/* Mode dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
                {filterMode === "filter" ? "Filter" : "Highlight"}
                <IconChevronDown className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => onFilterModeChange("filter")}
                  className={cn(filterMode === "filter" && "bg-accent")}
                >
                  Filter
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onFilterModeChange("highlight")}
                  className={cn(filterMode === "highlight" && "bg-accent")}
                >
                  Highlight
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Category buttons */}
            {["all", "me", "context", "assistant", "system", "compaction", "subagent"].map((f) => {
              const labelMap: Record<string, string> = {
                all: "All",
                me: "Me",
                context: "Context",
                assistant: "Assistant",
                system: "System",
                compaction: "Compaction",
                subagent: "Sub-agent",
              };
              return (
                <button
                  key={f}
                  onClick={() => onFilterChange(f)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[0.65rem] font-medium transition-colors whitespace-nowrap",
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {labelMap[f]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {events.length.toLocaleString()}
              {totalCount > events.length && ` / ${totalCount.toLocaleString()}`} events
            </span>
            {loadingMore && (
              <IconLoader2 className="size-3 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-hidden">
        {loading && events.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No events found</p>
          </div>
        ) : (
          <List<EventRowBaseProps>
            listRef={listRef}
            rowCount={events.length}
            rowHeight={rowHeight}
            rowComponent={EventRowComponent}
            rowProps={rowProps}
            onRowsRendered={handleRowsRendered}
            className="scrollbar-thin h-full"
          />
        )}
      </div>
    </div>
  );

  // Sub-agent panel component
  // Find the launching event for the selected sub-agent
  const launchingEvent = useMemo(() => {
    if (!selectedSubagentId) return null;
    return events.find((e) => e.launchedAgentId === selectedSubagentId) ?? null;
  }, [events, selectedSubagentId]);

  const SubagentPanel = (
    <div className={cn(
      "h-full flex flex-col border-l border-border",
      !selectedSubagentId && "hidden"
    )}>
      {/* Sub-agent header - scrollable when panel is narrow */}
      <div className="shrink-0 border-b border-border bg-purple-500/5 overflow-x-auto scrollbar-thin">
        {/* Top row: agent ID, status, close button */}
        <div className="px-3 py-2 flex items-center justify-between gap-2 min-w-fit">
          <div className="flex items-center gap-2 shrink-0">
            <IconStack2 className="size-4 text-purple-500" />
            <span className="text-xs font-medium whitespace-nowrap">Sub-agent</span>
            <span className="text-xs text-purple-600 dark:text-purple-400 font-mono whitespace-nowrap">{selectedSubagentId}</span>
            {launchingEvent?.launchedAgentStatus && (
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[0.6rem] font-medium whitespace-nowrap",
                launchingEvent.launchedAgentStatus === "async_launched"
                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground"
              )}>
                {launchingEvent.launchedAgentIsAsync ? "async" : "sync"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {subagentEvents.length.toLocaleString()}
              {subagentTotalCount > subagentEvents.length && ` / ${subagentTotalCount.toLocaleString()}`} events
            </span>
            {subagentLoadingMore && (
              <IconLoader2 className="size-3 animate-spin text-muted-foreground" />
            )}
            <button
              onClick={() => onSelectSubagent(null)}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <IconX className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
        {/* Description and prompt */}
        {launchingEvent && (launchingEvent.launchedAgentDescription || launchingEvent.launchedAgentPrompt) && (
          <div className="px-3 pb-2 space-y-1">
            {launchingEvent.launchedAgentDescription && (
              <div className="text-xs font-medium text-foreground">
                {launchingEvent.launchedAgentDescription}
              </div>
            )}
            {launchingEvent.launchedAgentPrompt && (
              <div className="flex items-start gap-2">
                <div className={cn(
                  "flex-1 text-[0.65rem] text-muted-foreground",
                  subagentPromptExpanded ? "whitespace-pre-wrap" : "line-clamp-2"
                )}>
                  {launchingEvent.launchedAgentPrompt}
                </div>
                <button
                  onClick={() => setSubagentPromptExpanded(!subagentPromptExpanded)}
                  className="shrink-0 flex items-center gap-0.5 text-[0.6rem] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                >
                  <span>{subagentPromptExpanded ? "less" : "more"}</span>
                  <IconChevronDown className={cn(
                    "size-3 transition-transform",
                    subagentPromptExpanded && "rotate-180"
                  )} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sub-agent event list */}
      <div className="flex-1 overflow-hidden">
        {subagentLoading ? (
          <div className="h-full flex items-center justify-center">
            <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : subagentEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No events found</p>
          </div>
        ) : (
          <List<EventRowBaseProps>
            listRef={subagentListRef}
            rowCount={subagentEvents.length}
            rowHeight={rowHeight}
            rowComponent={EventRowComponent}
            rowProps={subagentRowProps}
            onRowsRendered={handleSubagentRowsRendered}
            className="scrollbar-thin h-full"
          />
        )}
      </div>
    </div>
  );

  // Determine which event to show in JSON viewer (main event or subagent event)
  const jsonViewerEvent = subagentSelectedEvent ?? selectedEvent;
  const jsonViewerJson = subagentSelectedEvent ? subagentRawJson : rawJson;
  const jsonViewerLoading = subagentSelectedEvent ? subagentRawJsonLoading : rawJsonLoading;
  const isSubagentJson = !!subagentSelectedEvent;

  // JSON Viewer Panel component
  const JSONViewerPanel = (
    <div className={cn(
      "h-full flex flex-col border-l border-border bg-background",
      !jsonViewerEvent && "hidden"
    )}>
      {jsonViewerEvent && (
        <>
          {/* Header */}
          <div className="shrink-0 border-b border-border overflow-x-auto scrollbar-thin">
            <div className="px-3 py-2 flex items-center justify-between gap-2 min-w-fit">
              <div className="flex items-center gap-2 shrink-0">
                {isSubagentJson && (
                  <>
                    <IconStack2 className="size-4 text-purple-500" />
                    <span className="text-xs text-purple-500 font-mono whitespace-nowrap">{selectedSubagentId}</span>
                  </>
                )}
                <span
                  className={cn(
                    "px-2 py-1 rounded text-xs font-medium whitespace-nowrap",
                    getEventBadgeClass(jsonViewerEvent)
                  )}
                >
                  {jsonViewerEvent.subtype === "compact_boundary" ? "Compaction" : jsonViewerEvent.eventType}
                </span>
                {jsonViewerEvent.toolName && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap">
                    {jsonViewerEvent.toolName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Seq #{jsonViewerEvent.sequence}
                </span>
                <button
                  onClick={() => {
                    if (jsonViewerJson) {
                      navigator.clipboard.writeText(jsonViewerJson);
                      setJsonCopied(true);
                      setTimeout(() => setJsonCopied(false), 2000);
                    }
                  }}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Copy JSON"
                >
                  {jsonCopied ? (
                    <IconCheck className="size-3.5 text-green-500" />
                  ) : (
                    <IconCopy className="size-3.5 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={() => {
                    if (isSubagentJson) {
                      setSubagentSelectedEvent(null);
                      setSubagentRawJson(null);
                    } else {
                      setSelectedEvent(null);
                      setRawJson(null);
                    }
                  }}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Close"
                >
                  <IconX className="size-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
            {/* Timestamp and UUID row */}
            <div className="px-3 pb-2 flex items-center gap-3 text-xs text-muted-foreground">
              {jsonViewerEvent.timestamp && (
                <span className="whitespace-nowrap">
                  {new Date(jsonViewerEvent.timestamp).toLocaleString()}
                </span>
              )}
              {jsonViewerEvent.uuid && (
                <span className="font-mono whitespace-nowrap">
                  {jsonViewerEvent.uuid}
                </span>
              )}
            </div>
          </div>

          {/* Compaction metadata */}
          {jsonViewerEvent.subtype === "compact_boundary" && jsonViewerEvent.compactMetadata && (
            <div className="shrink-0 px-3 py-2 bg-amber-500/10 border-b border-border">
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Trigger: </span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {jsonViewerEvent.compactMetadata.trigger}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Pre-compaction: </span>
                  <span className="font-medium">
                    {jsonViewerEvent.compactMetadata.preTokens.toLocaleString()} tokens
                  </span>
                </div>
              </div>
              {jsonViewerEvent.logicalParentUuid && summaryMap.get(jsonViewerEvent.logicalParentUuid) && (
                <div className="mt-1 text-xs">
                  <span className="text-muted-foreground">Summary: </span>
                  <span className="italic">
                    "{summaryMap.get(jsonViewerEvent.logicalParentUuid)}"
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Summary event content */}
          {jsonViewerEvent.eventType === "summary" && jsonViewerEvent.summary && (
            <div className="shrink-0 px-3 py-2 bg-green-500/10 border-b border-border">
              <div className="text-xs">
                <span className="text-muted-foreground">Summary: </span>
                <span>{jsonViewerEvent.summary}</span>
              </div>
            </div>
          )}

          {/* JSON content */}
          <div className="flex-1 overflow-auto p-3">
            {jsonViewerLoading ? (
              <div className="flex items-center justify-center py-8">
                <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <JsonViewerRoot json={jsonViewerJson ?? "{}"} />
            )}
          </div>
        </>
      )}
    </div>
  );

  // Determine which resize handles to show
  const showSubagentHandle = !!selectedSubagentId;
  const showJsonHandle = !!(selectedEvent || subagentSelectedEvent);

  // Always render PanelGroup to preserve scroll position when opening/closing panels
  // Note: No autoSaveId - panel state is controlled by selection state, not persisted
  return (
    <>
      <PanelGroup direction="horizontal">
        {/* Main event list - always visible, takes full width when other panels collapsed */}
        <Panel ref={mainPanelRef} defaultSize={100} minSize={10}>
          {MainEventList}
        </Panel>

        {/* Subagent panel resize handle */}
        <PanelResizeHandle className={cn(
          "w-1 bg-border hover:bg-primary/50 transition-colors",
          !showSubagentHandle && "hidden"
        )} />

        {/* Subagent panel - collapsible, starts collapsed */}
        <Panel
          ref={subagentPanelRef}
          defaultSize={0}
          minSize={0}
          collapsible
          collapsedSize={0}
          onCollapse={() => {
            // When panel is collapsed by resize handle, clear selection
            // The unified layout useEffect will handle panel sizing
            if (selectedSubagentId) {
              handleSelectSubagent(null);
            }
          }}
        >
          {SubagentPanel}
        </Panel>

        {/* JSON viewer resize handle */}
        <PanelResizeHandle className={cn(
          "w-1 bg-border hover:bg-primary/50 transition-colors",
          !showJsonHandle && "hidden"
        )} />

        {/* JSON viewer panel - collapsible, starts collapsed */}
        <Panel
          ref={jsonPanelRef}
          defaultSize={0}
          minSize={0}
          collapsible
          collapsedSize={0}
          onCollapse={() => {
            // When panel is collapsed by resize handle, clear event selection
            // The unified layout useEffect will handle panel sizing
            if (subagentSelectedEvent) {
              setSubagentSelectedEvent(null);
              setSubagentRawJson(null);
            } else if (selectedEvent) {
              setSelectedEvent(null);
              setRawJson(null);
            }
          }}
        >
          {JSONViewerPanel}
        </Panel>
      </PanelGroup>
    </>
  );
}
