import {
  IconChevronRight,
  IconBolt,
  IconStack2,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { formatEventTime, getEventBadgeClass } from "../utils";
import type { EventRowProps } from "../types";

export function EventRowComponent({
  index,
  style,
  events,
  onSelectEvent,
  onSelectSubagent,
  summaryMap,
  selectedSubagentId,
}: EventRowProps) {
  const event = events[index];
  const isCompaction = event.subtype === "compact_boundary";
  const isSubagentLaunch = !!event.launchedAgentId;
  const linkedSummary = event.logicalParentUuid ? summaryMap.get(event.logicalParentUuid) : null;

  // Compaction events render as a distinct separator row
  if (isCompaction) {
    return (
      <div style={style} className="px-3">
        <div
          className="h-full flex items-center cursor-pointer hover:bg-amber-500/10 rounded"
          onClick={() => onSelectEvent(event)}
        >
          <span className="text-[0.65rem] text-muted-foreground w-[11.5rem] shrink-0 font-mono whitespace-nowrap">
            {formatEventTime(event.timestamp)}
          </span>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <IconBolt className="size-3.5" />
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
        <div
          className={cn(
            "h-full flex items-center cursor-pointer rounded transition-colors",
            isSelected
              ? "bg-purple-500/20 hover:bg-purple-500/25"
              : "hover:bg-purple-500/10"
          )}
          onClick={() => onSelectSubagent(event.launchedAgentId!)}
        >
          <span className="text-[0.65rem] text-muted-foreground w-[11.5rem] shrink-0 font-mono whitespace-nowrap">
            {formatEventTime(event.timestamp)}
          </span>
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <IconStack2 className="size-3.5" />
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
          <IconChevronRight className="size-3.5 text-purple-500/50 mr-2" />
        </div>
      </div>
    );
  }

  return (
    <div style={style} className="px-3">
      <div className="h-full border-b border-border/50 py-1">
        <div
          className="flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1 h-full"
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
              {event.eventType}
            </span>

            {/* Tool name badge (if applicable) */}
            {event.toolName && (
              <span className="px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-muted text-muted-foreground shrink-0 truncate max-w-24">
                {event.toolName}
              </span>
            )}
          </div>

          {/* Preview text */}
          <span className="flex-1 min-w-0 text-xs truncate text-muted-foreground">
            {event.preview || event.summary}
          </span>
        </div>
      </div>
    </div>
  );
}
