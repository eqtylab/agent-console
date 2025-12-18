import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  IconCheck,
  IconChevronDown,
  IconLoader2,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Session, ActiveSessionsResult, FileEdit, FileDiff, SessionEvent, SessionEventsResponse, SearchResponse } from "@/lib/types";
import { formatRelativeTime, truncateUuid } from "./utils";
import { EditViewer } from "./components/edit-viewer";
import { EventLogViewer } from "./components/event-log-viewer";
import { PolicyViewer } from "./components/policy-viewer";
import type { ProjectDetailPageProps, TabId, EventFilterMode } from "./types";

export function ProjectDetailPage({ projectPath }: ProjectDetailPageProps) {
  const projectName = projectPath.split("/").pop() || projectPath;

  // Window-local state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isProjectActive, setIsProjectActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("events");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // File edits state
  const [fileEdits, setFileEdits] = useState<FileEdit[]>([]);
  const [fileEditsLoading, setFileEditsLoading] = useState(false);

  // Diffs state
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [diffsLoading, setDiffsLoading] = useState(false);

  // Events state (for log viewer)
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsLoadingMore, setEventsLoadingMore] = useState(false);
  const [eventsTotalCount, setEventsTotalCount] = useState(0);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [eventFilterMode, setEventFilterMode] = useState<EventFilterMode>("filter");
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load sessions and active status on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [sessionList, activeResult] = await Promise.all([
          invoke<Session[]>("get_project_sessions", { projectPath }),
          invoke<ActiveSessionsResult>("get_active_sessions"),
        ]);

        setSessions(sessionList);
        setIsProjectActive(activeResult.activePaths.includes(projectPath));

        // Default to most recent session
        if (sessionList.length > 0 && !selectedSessionId) {
          setSelectedSessionId(sessionList[0].id);
        }
      } catch (err) {
        console.error("Failed to load sessions:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [projectPath]);

  // Load file edits function (reusable for initial load and refresh)
  const loadFileEdits = useCallback(async () => {
    if (!selectedSessionId) {
      setFileEdits([]);
      return;
    }

    setFileEditsLoading(true);
    try {
      const edits = await invoke<FileEdit[]>("get_session_file_edits", {
        projectPath,
        sessionId: selectedSessionId,
      });
      setFileEdits(edits);
    } catch (err) {
      console.error("Failed to load file edits:", err);
      setFileEdits([]);
    } finally {
      setFileEditsLoading(false);
    }
  }, [projectPath, selectedSessionId]);

  // Load file edits when session changes
  useEffect(() => {
    if (!selectedSessionId) {
      setFileEdits([]);
      return;
    }

    setSelectedFile(null);
    setDiffs([]);
    loadFileEdits();
  }, [projectPath, selectedSessionId, loadFileEdits]);

  // Load diffs when file selection changes
  const handleSelectFile = useCallback(
    async (filePath: string) => {
      setSelectedFile(filePath);
      if (!selectedSessionId) return;

      setDiffsLoading(true);
      try {
        const fileDiffs = await invoke<FileDiff[]>("get_file_diffs", {
          projectPath,
          sessionId: selectedSessionId,
          filePath,
        });
        setDiffs(fileDiffs);
      } catch (err) {
        console.error("Failed to load diffs:", err);
        setDiffs([]);
      } finally {
        setDiffsLoading(false);
      }
    },
    [projectPath, selectedSessionId]
  );

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // Load initial events when switching to events tab
  const loadEvents = useCallback(async () => {
    if (!selectedSessionId) {
      setEvents([]);
      setEventsTotalCount(0);
      setEventsHasMore(false);
      return;
    }

    setEventsLoading(true);
    try {
      const response = await invoke<SessionEventsResponse>("get_session_events", {
        projectPath,
        sessionId: selectedSessionId,
        offset: 0,
        limit: 200,
      });
      setEvents(response.events);
      setEventsTotalCount(response.totalCount);
      setEventsHasMore(response.hasMore);
    } catch (err) {
      console.error("Failed to load events:", err);
      setEvents([]);
      setEventsTotalCount(0);
      setEventsHasMore(false);
    } finally {
      setEventsLoading(false);
    }
  }, [projectPath, selectedSessionId]);

  // Unified session change handler - refreshes all views that need updating
  const handleSessionChanged = useCallback(() => {
    // Always refresh file edits (for Edits tab)
    loadFileEdits();

    // Refresh events if they've been loaded (for Events tab)
    // Since events are in descending order, this gets the latest at the top
    if (events.length > 0 || activeTab === "events") {
      loadEvents();
    }
  }, [loadFileEdits, loadEvents, events.length, activeTab]);

  // Watch session file for real-time updates
  useEffect(() => {
    if (!selectedSessionId) return;

    let unlisten: (() => void) | null = null;

    async function setupWatcher() {
      // Start watching the session file
      try {
        await invoke("watch_session", {
          projectPath,
          sessionId: selectedSessionId,
        });
      } catch (err) {
        console.error("Failed to start session watcher:", err);
      }

      // Listen for session-changed events - single stream, multiple consumers
      unlisten = await listen<{ projectPath: string; sessionId: string }>(
        "session-changed",
        (event) => {
          // Only refresh if this event is for our current session
          if (
            event.payload.projectPath === projectPath &&
            event.payload.sessionId === selectedSessionId
          ) {
            handleSessionChanged();
          }
        }
      );
    }

    setupWatcher();

    // Cleanup: stop watching and remove listener
    return () => {
      if (unlisten) {
        unlisten();
      }
      invoke("unwatch_session", {
        projectPath,
        sessionId: selectedSessionId,
      }).catch((err) => {
        console.error("Failed to stop session watcher:", err);
      });
    };
  }, [projectPath, selectedSessionId, handleSessionChanged]);

  // Load more events for infinite scrolling
  const loadMoreEvents = useCallback(async () => {
    if (!selectedSessionId || eventsLoadingMore || !eventsHasMore) {
      return;
    }

    setEventsLoadingMore(true);
    try {
      const response = await invoke<SessionEventsResponse>("get_session_events", {
        projectPath,
        sessionId: selectedSessionId,
        offset: events.length,
        limit: 200,
      });
      setEvents((prev) => [...prev, ...response.events]);
      setEventsHasMore(response.hasMore);
    } catch (err) {
      console.error("Failed to load more events:", err);
    } finally {
      setEventsLoadingMore(false);
    }
  }, [projectPath, selectedSessionId, events.length, eventsLoadingMore, eventsHasMore]);

  // Load events when tab switches to events
  useEffect(() => {
    if (activeTab === "events" && events.length === 0 && !eventsLoading) {
      loadEvents();
    }
  }, [activeTab, events.length, eventsLoading, loadEvents]);

  // Reset events and search when session changes
  useEffect(() => {
    setEvents([]);
    setEventsTotalCount(0);
    setEventsHasMore(false);
    setSearchQuery("");
    setSearchResults(null);
  }, [selectedSessionId]);

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim() || !selectedSessionId) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await invoke<SearchResponse>("search_session_events", {
          projectPath,
          sessionId: selectedSessionId,
          query: searchQuery,
          maxResults: 10000,
        });
        setSearchResults(response);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [projectPath, selectedSessionId, searchQuery]);

  // Filter or highlight events based on current filter, mode, and search
  const { filteredEvents, highlightedIndices } = useMemo(() => {
    // Build search match set from backend results
    const searchMatchSet = searchResults
      ? new Set(searchResults.matches.map((m) => m.sequence))
      : null;

    const matchesFilter = (e: SessionEvent) => {
      // Check event type filter
      if (eventFilter !== "all") {
        if (eventFilter === "compaction") {
          if (e.subtype !== "compact_boundary" && e.eventType !== "summary") {
            return false;
          }
        } else if (eventFilter === "subagent") {
          if (!e.launchedAgentId) return false;
        } else if (eventFilter === "me") {
          // Only actual human input: userType: "external" AND none of the system markers
          if (e.eventType !== "user") return false;
          if (e.userType !== "external") return false;
          // Exclude system-injected messages
          if (e.isCompactSummary || e.isMeta || e.isToolResult) return false;
          if (e.preview?.startsWith("<command-message>")) return false;
        } else if (eventFilter === "context") {
          // System-injected user messages (compact summaries, tool results, meta, command notifications)
          if (e.eventType !== "user") return false;
          // Must have at least one system marker
          const isSystemInjected = e.isCompactSummary || e.isMeta || e.isToolResult || e.preview?.startsWith("<command-message>");
          if (!isSystemInjected) return false;
        } else if (e.eventType !== eventFilter) {
          return false;
        }
      }

      // Check search filter (if active)
      if (searchMatchSet && !searchMatchSet.has(e.sequence)) {
        return false;
      }

      return true;
    };

    if (eventFilterMode === "filter") {
      // Filter mode: return only matching events
      const noFiltersActive = eventFilter === "all" && !searchMatchSet;
      return {
        filteredEvents: noFiltersActive ? events : events.filter(matchesFilter),
        highlightedIndices: undefined,
      };
    } else {
      // Highlight mode: return all events, but track which indices to highlight
      const highlighted = new Set<number>();
      const hasActiveFilter = eventFilter !== "all" || searchMatchSet;
      if (hasActiveFilter) {
        events.forEach((e, i) => {
          if (matchesFilter(e)) {
            highlighted.add(i);
          }
        });
      }
      return {
        filteredEvents: events,
        highlightedIndices: highlighted.size > 0 ? highlighted : undefined,
      };
    }
  }, [events, eventFilter, eventFilterMode, searchResults]);

  // Build snippet lookup map from search results
  const snippetMap = useMemo(() => {
    if (!searchResults) return undefined;
    const map = new Map<number, string>();
    for (const match of searchResults.matches) {
      map.set(match.sequence, match.snippet);
    }
    return map;
  }, [searchResults]);

  // Build summary lookup map for compaction events
  const summaryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      if (event.eventType === "summary" && event.leafUuid && event.summary) {
        map.set(event.leafUuid, event.summary);
      }
    }
    return map;
  }, [events]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Compact Header */}
      <div className="shrink-0 border-b border-border px-3 py-2 flex items-center justify-between gap-4">
        {/* Left: Project info */}
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm font-semibold shrink-0">{projectName}</h1>
          <span className="text-xs text-muted-foreground truncate">
            {projectPath}
          </span>
        </div>

        {/* Right: Session selector */}
        <div className="shrink-0">
          {loading ? (
            <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
          ) : sessions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 h-7 px-2">
                  {isProjectActive && selectedSessionId === sessions[0]?.id && (
                    <span className="size-2 rounded-full bg-green-500 shrink-0" />
                  )}
                  <span className="font-mono text-xs">
                    {selectedSession ? truncateUuid(selectedSession.id) : "Select"}
                  </span>
                  {selectedSession && (
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(selectedSession.lastActivity)}
                    </span>
                  )}
                  <IconChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {sessions.map((session, index) => (
                  <DropdownMenuItem
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {session.id === selectedSessionId ? (
                        <IconCheck className="size-3 shrink-0" />
                      ) : (
                        <span className="size-3 shrink-0" />
                      )}
                      {index === 0 && isProjectActive && (
                        <span className="size-2 rounded-full bg-green-500 shrink-0" />
                      )}
                      <span className="font-mono text-xs">
                        {truncateUuid(session.id)}
                      </span>
                      {session.slug && (
                        <span className="text-xs text-muted-foreground truncate max-w-24">
                          {session.slug}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(session.lastActivity)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-xs text-muted-foreground">No sessions</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-border px-3">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("events")}
            className={cn(
              "py-2 text-xs font-medium border-b-2 transition-colors",
              activeTab === "events"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Events
          </button>
          <button
            onClick={() => setActiveTab("edits")}
            className={cn(
              "py-2 text-xs font-medium border-b-2 transition-colors",
              activeTab === "edits"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Edits
          </button>
          <button
            onClick={() => setActiveTab("policies")}
            className={cn(
              "py-2 text-xs font-medium border-b-2 transition-colors",
              activeTab === "policies"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Policies
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!selectedSession ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No session selected</p>
          </div>
        ) : activeTab === "events" ? (
          <EventLogViewer
            events={filteredEvents}
            loading={eventsLoading}
            loadingMore={eventsLoadingMore}
            filter={eventFilter}
            onFilterChange={setEventFilter}
            filterMode={eventFilterMode}
            onFilterModeChange={setEventFilterMode}
            highlightedIndices={highlightedIndices}
            summaryMap={summaryMap}
            onLoadMore={loadMoreEvents}
            totalCount={eventsTotalCount}
            hasMore={eventsHasMore}
            projectPath={projectPath}
            sessionId={selectedSessionId ?? ""}
            selectedSubagentId={selectedSubagentId}
            onSelectSubagent={setSelectedSubagentId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchLoading={searchLoading}
            searchResults={searchResults}
            snippetMap={snippetMap}
          />
        ) : activeTab === "edits" ? (
          <EditViewer
            projectPath={projectPath}
            fileEdits={fileEdits}
            fileEditsLoading={fileEditsLoading}
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
            diffs={diffs}
            diffsLoading={diffsLoading}
          />
        ) : (
          <PolicyViewer projectPath={projectPath} />
        )}
      </div>
    </div>
  );
}
