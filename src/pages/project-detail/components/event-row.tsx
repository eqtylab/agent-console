import { cn } from "@/lib/utils";
import { formatEventTime, getEventBadgeClass, getEventDisplayLabel } from "../utils";
import type { EventRowProps } from "../types";

// Parse search query into terms (same logic as Rust backend)
function parseSearchTerms(query: string): string[] {
  if (!query.trim()) return [];
  return query
    .split(/\s+/)
    .filter((word) => word !== "AND" && word !== "OR")
    .map((word) => word.toLowerCase());
}

// Highlight matching terms in text
function highlightTerms(text: string, terms: string[]): React.ReactNode {
  if (terms.length === 0) return text;

  // Build regex to match any term (case-insensitive)
  const pattern = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");

  const parts = text.split(regex);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const isMatch = terms.some((t) => part.toLowerCase() === t);
    if (isMatch) {
      return (
        <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 text-foreground rounded-sm px-0.5">
          {part}
        </mark>
      );
    }
    return part;
  });
}

export function EventRowComponent({
  index,
  style,
  events,
  onSelectEvent,
  onSelectSubagent,
  summaryMap,
  selectedSubagentId,
  highlightedIndices,
  flashingByteOffsets,
  snippetMap,
  searchQuery,
}: EventRowProps) {
  const event = events[index];
  const isCompaction = event.subtype === "compact_boundary";
  const isSubagentLaunch = !!event.launchedAgentId;
  const linkedSummary = event.logicalParentUuid ? summaryMap.get(event.logicalParentUuid) : null;
  const isHighlighted = highlightedIndices?.has(index) ?? false;
  const isFlashing = flashingByteOffsets?.has(event.byteOffset) ?? false;
  const searchTerms = searchQuery ? parseSearchTerms(searchQuery) : [];

  // Highlight wrapper - adds a visible boundary box around highlighted rows
  const HighlightWrapper = ({ children }: { children: React.ReactNode }) => {
    if (!isHighlighted) return <>{children}</>;
    return (
      <div className="relative">
        {/* Highlight border - extends slightly outside the row */}
        <div className="absolute -inset-y-0.5 inset-x-1 border-2 border-primary rounded-md pointer-events-none" />
        {children}
      </div>
    );
  };

  // Compaction events render as a distinct separator row
  if (isCompaction) {
    return (
      <div style={style} className="px-3">
        <HighlightWrapper>
          <div
            className={cn(
              "h-full flex items-center cursor-pointer hover:bg-amber-500/10 rounded",
              isFlashing && "animate-flash"
            )}
            onClick={() => onSelectEvent(event)}
          >
            <span className="text-[0.65rem] text-muted-foreground w-[11.5rem] shrink-0 font-mono whitespace-nowrap">
              {formatEventTime(event.timestamp)}
            </span>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <span className="text-[0.65rem] font-medium">Compaction</span>
              {event.compactMetadata && (
                <span className="text-[0.6rem] text-amber-600/70 dark:text-amber-400/70">
                  {event.compactMetadata.trigger} • {event.compactMetadata.preTokens.toLocaleString()} tokens
                </span>
              )}
              {linkedSummary && (
                <span className="text-[0.6rem] text-muted-foreground italic truncate max-w-64">
                  "{linkedSummary}"
                </span>
              )}
            </div>
            <div className="flex-1 h-px bg-amber-500/30 ml-3" />
          </div>
        </HighlightWrapper>
      </div>
    );
  }

  // Sub-agent/Task events - all have agentId and are clickable
  // Async launches have isAsync=true, status="async_launched"
  // Sync/async completions have status="completed"
  if (isSubagentLaunch && event.launchedAgentId) {
    const isAsyncLaunch = event.launchedAgentIsAsync === true;
    const isSelected = selectedSubagentId === event.launchedAgentId;

    return (
      <div style={style} className="px-3">
        <HighlightWrapper>
          <div
            className={cn(
              "h-full flex items-center cursor-pointer rounded transition-colors",
              isSelected
                ? "bg-purple-500/20 hover:bg-purple-500/25"
                : "hover:bg-purple-500/10",
              isFlashing && "animate-flash"
            )}
            onClick={() => onSelectSubagent(event.launchedAgentId!)}
          >
            <span className="text-[0.65rem] text-muted-foreground w-[11.5rem] shrink-0 font-mono whitespace-nowrap">
              {formatEventTime(event.timestamp)}
            </span>
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
              <span className="text-[0.65rem] font-medium">
                {isAsyncLaunch ? "Sub-agent" : "Task"}
              </span>
              <span className="text-[0.6rem] text-purple-600/70 dark:text-purple-400/70 font-mono">
                {event.launchedAgentId}
              </span>
              {isAsyncLaunch && (
                <span className="text-[0.6rem] px-1 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400">
                  async
                </span>
              )}
              {event.launchedAgentDescription && (
                <span className="text-[0.6rem] text-muted-foreground truncate max-w-80">
                  {event.launchedAgentDescription}
                </span>
              )}
            </div>
            <div className="flex-1 h-px bg-purple-500/30 ml-3" />
          </div>
        </HighlightWrapper>
      </div>
    );
  }

  return (
    <div style={style} className="px-3">
      <HighlightWrapper>
        <div className="h-full border-b border-border/50 py-1">
          <div
            className={cn(
              "flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1 h-full",
              isFlashing && "animate-flash"
            )}
            onClick={() => onSelectEvent(event)}
          >
            {/* Timestamp */}
            <span className="text-[0.65rem] text-muted-foreground w-[11.5rem] shrink-0 font-mono whitespace-nowrap">
              {formatEventTime(event.timestamp)}
            </span>

            {/* Badges container - fixed width for table-like alignment */}
            <div className="w-32 shrink-0 flex items-center gap-1.5 overflow-hidden">
              {/* Event type badge */}
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[0.6rem] font-medium shrink-0",
                  getEventBadgeClass(event)
                )}
              >
                {getEventDisplayLabel(event)}
              </span>

              {/* Tool name badge (if applicable) */}
              {event.toolName && (
                <span className="px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-muted text-muted-foreground shrink-0 truncate max-w-24">
                  {event.toolName}
                </span>
              )}
            </div>

            {/* Preview text (or snippet when searching, with highlighted terms) */}
            <span className="flex-1 min-w-0 text-xs truncate text-muted-foreground">
              {(() => {
                const snippet = snippetMap?.get(event.sequence);
                const text = snippet ?? event.preview ?? event.summary ?? "";
                // Highlight search terms in snippets
                if (snippet && searchTerms.length > 0) {
                  return highlightTerms(text, searchTerms);
                }
                return text;
              })()}
            </span>
          </div>
        </div>
      </HighlightWrapper>
    </div>
  );
}
