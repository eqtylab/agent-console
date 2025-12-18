import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import {
  IconChevronRight,
  IconChevronLeft,
} from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PolicyEvaluation, CupcakeSpan } from "@/lib/types";
import { formatRelativeTime } from "../utils";
import {
  flattenCupcakeSpan,
  getDecisionBadgeClass,
  formatDuration,
  snakeToCamelKeys,
  type TraceSpan,
} from "../policy-utils";
import { PolicyTraceChart } from "./policy-trace-chart";
import { PolicySpanDetails } from "./policy-span-details";

interface PolicyViewerProps {
  projectPath: string;
}

export function PolicyViewer({ projectPath }: PolicyViewerProps) {
  const [evaluations, setEvaluations] = useState<PolicyEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvaluation, setSelectedEvaluation] =
    useState<PolicyEvaluation | null>(null);
  const [cupcakeSpan, setCupcakeSpan] = useState<CupcakeSpan | null>(null);
  const [spanLoading, setSpanLoading] = useState(false);
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const [flashingEvaluations, setFlashingEvaluations] = useState<Set<string>>(
    new Set()
  );
  const prevTimestampsRef = useRef<Map<string, string>>(new Map());

  // Load evaluations
  const loadEvaluations = useCallback(async () => {
    try {
      const evals = await invoke<PolicyEvaluation[]>("get_policy_evaluations", {
        projectPath,
      });
      setEvaluations(evals);

      // Track new evaluations for flash animation
      const newFlashing = new Set<string>();
      const currentTimestamps = new Map<string, string>();

      for (const e of evals) {
        currentTimestamps.set(e.filename, e.timestamp);
        const prevTs = prevTimestampsRef.current.get(e.filename);
        if (prevTs === undefined && prevTimestampsRef.current.size > 0) {
          newFlashing.add(e.filename);
        }
      }

      if (newFlashing.size > 0) {
        setFlashingEvaluations(newFlashing);
        setTimeout(() => setFlashingEvaluations(new Set()), 900);
      }

      prevTimestampsRef.current = currentTimestamps;
    } catch (err) {
      console.error("Failed to load policy evaluations:", err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  // Initial load
  useEffect(() => {
    loadEvaluations();
  }, [loadEvaluations]);

  // Watch telemetry directory for changes
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    async function setupWatcher() {
      // Start watching
      try {
        await invoke("watch_telemetry", { projectPath });
      } catch (err) {
        console.error("Failed to start telemetry watcher:", err);
      }

      // Listen for changes
      unlisten = await listen<{ projectPath: string }>(
        "telemetry-changed",
        (event) => {
          if (event.payload.projectPath === projectPath) {
            loadEvaluations();
          }
        }
      );
    }

    setupWatcher();

    return () => {
      // Cleanup
      if (unlisten) unlisten();
      invoke("unwatch_telemetry", { projectPath }).catch(() => {});
    };
  }, [projectPath, loadEvaluations]);

  // Load span when evaluation is selected
  useEffect(() => {
    if (!selectedEvaluation) {
      setCupcakeSpan(null);
      setSelectedSpan(null);
      return;
    }

    async function loadSpan() {
      setSpanLoading(true);
      setSelectedSpan(null);
      try {
        const rawJson = await invoke<string | null>("get_policy_evaluation", {
          projectPath,
          filename: selectedEvaluation!.filename,
        });
        if (rawJson) {
          const rawSpan = JSON.parse(rawJson);
          const span = snakeToCamelKeys<CupcakeSpan>(rawSpan);
          setCupcakeSpan(span);
        } else {
          setCupcakeSpan(null);
        }
      } catch (err) {
        console.error("Failed to load span:", err);
        setCupcakeSpan(null);
      } finally {
        setSpanLoading(false);
      }
    }

    loadSpan();
  }, [projectPath, selectedEvaluation]);

  // Flatten span for chart
  const traceSpans = cupcakeSpan ? flattenCupcakeSpan(cupcakeSpan) : [];

  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId="policy-viewer-layout"
      className="h-full"
    >
      {/* Evaluation list sidebar */}
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
            // Collapsed view
            <>
              <div className="shrink-0 px-2 py-2 border-b border-border flex items-center justify-center">
                <button
                  onClick={() => sidebarPanelRef.current?.expand()}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Expand sidebar"
                >
                  <IconChevronRight className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto py-1">
                {evaluations.map((e) => (
                  <Tooltip key={e.filename}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setSelectedEvaluation(e)}
                        className={cn(
                          "w-full flex items-center justify-center py-1.5 transition-colors",
                          selectedEvaluation?.filename === e.filename
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted",
                          flashingEvaluations.has(e.filename) && "animate-flash"
                        )}
                      >
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            e.decision?.toLowerCase() === "allow"
                              ? "bg-green-500"
                              : e.decision?.toLowerCase() === "block" ||
                                  e.decision?.toLowerCase() === "halt"
                                ? "bg-red-500"
                                : e.decision?.toLowerCase() === "ask"
                                  ? "bg-yellow-500"
                                  : "bg-gray-500"
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs">
                        {e.eventType}:{e.toolName} - {e.decision || "Unknown"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </>
          ) : (
            // Expanded view
            <>
              <div className="shrink-0 px-3 py-2 border-b border-border flex items-center gap-2">
                <button
                  onClick={() => sidebarPanelRef.current?.collapse()}
                  className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Collapse sidebar"
                >
                  <IconChevronLeft className="size-3.5" />
                </button>
                <span className="text-xs font-medium text-muted-foreground">
                  Evaluations ({evaluations.length})
                </span>
                {loading && <span className="text-xs text-muted-foreground animate-pulse">...</span>}
              </div>

              <div className="flex-1 overflow-auto">
                {loading && evaluations.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    Loading evaluations...
                  </div>
                ) : evaluations.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    <p className="mb-2">No policy evaluations found.</p>
                    <p className="text-[0.65rem]">
                      Enable telemetry in your rulebook.yml to capture policy
                      evaluations.
                    </p>
                  </div>
                ) : (
                  <div className="py-1">
                    {evaluations.map((e) => (
                      <button
                        key={e.filename}
                        onClick={() => setSelectedEvaluation(e)}
                        className={cn(
                          "w-full flex flex-col gap-1 px-3 py-2 text-xs transition-colors border-b border-border/50",
                          selectedEvaluation?.filename === e.filename
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted",
                          flashingEvaluations.has(e.filename) && "animate-flash"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">
                            {e.eventType || "Event"}
                            {e.toolName && `:${e.toolName}`}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 px-1.5 py-0.5 rounded text-[0.65rem] font-medium",
                              getDecisionBadgeClass(e.decision)
                            )}
                          >
                            {e.decision || "?"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground">
                          <span>{formatRelativeTime(e.timestamp)}</span>
                          <span>{formatDuration(e.durationMs)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Panel>

      {/* Resize handle */}
      <PanelResizeHandle
        className={cn(
          "w-1 bg-border hover:bg-primary/50 transition-colors",
          sidebarCollapsed && "opacity-0 pointer-events-none"
        )}
      />

      {/* Content area */}
      <Panel defaultSize={75} minSize={30}>
        {!selectedEvaluation ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Select an evaluation to view trace</p>
          </div>
        ) : spanLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Loading trace...</p>
          </div>
        ) : !cupcakeSpan ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Failed to load trace data</p>
          </div>
        ) : (
          <PanelGroup
            direction="vertical"
            autoSaveId="policy-trace-layout"
            className="h-full"
          >
            {/* Trace chart */}
            <Panel defaultSize={60} minSize={20}>
              <PolicyTraceChart
                spans={traceSpans}
                selectedSpanId={selectedSpan?.spanId}
                onSpanSelect={setSelectedSpan}
              />
            </Panel>

            {/* Details panel */}
            <PanelResizeHandle className="h-1.5 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={40} minSize={15}>
              <PolicySpanDetails
                span={selectedSpan}
                cupcakeSpan={cupcakeSpan}
              />
            </Panel>
          </PanelGroup>
        )}
      </Panel>
    </PanelGroup>
  );
}
