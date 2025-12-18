/**
 * Utilities for policy trace visualization.
 * Converts CupcakeSpan data to a flat span format for D3 visualization.
 */

import type { CupcakeSpan, FinalDecision } from "@/lib/types";
import { getFinalDecisionType } from "@/lib/types";

/** Flat span representation for D3 visualization */
export interface TraceSpan {
  /** Unique span ID */
  spanId: string;
  /** Parent span ID (undefined for root) */
  parentId?: string;
  /** Display name */
  name: string;
  /** Service/phase type for coloring */
  serviceName: string;
  /** Start time relative to trace start (microseconds) */
  startTime: number;
  /** Duration in microseconds */
  duration: number;
  /** Status for coloring (ok, error, warning) */
  status: "ok" | "error" | "warning";
  /** Original data for details view */
  data?: unknown;
}

/** Color scheme for different span types */
export const SPAN_COLORS: Record<string, string> = {
  Root: "#71717a",       // gray
  Enrich: "#10b981",     // emerald
  Global: "#3b82f6",     // blue
  Catalog: "#8b5cf6",    // violet
  Project: "#f59e0b",    // amber
  Signals: "#06b6d4",    // cyan
  Signal: "#0891b2",     // cyan-darker
  Evaluation: "#22c55e", // green (allow)
  "Evaluation-Block": "#ef4444", // red
  "Evaluation-Halt": "#ef4444",  // red
  "Evaluation-Ask": "#eab308",   // yellow
};

/** Get color for a span based on its service name and status */
export function getSpanColor(span: TraceSpan): string {
  const key = span.status === "error"
    ? `${span.serviceName}-Block`
    : span.status === "warning"
    ? `${span.serviceName}-Ask`
    : span.serviceName;
  return SPAN_COLORS[key] || SPAN_COLORS[span.serviceName] || "#71717a";
}

/** Extract a human-readable name from raw event */
function getEventName(rawEvent: Record<string, unknown>): string {
  // After snake_to_camel conversion, fields are camelCase
  const hookEvent = (rawEvent.hookEventName || rawEvent.hook_event_name) as string | undefined;
  const toolName = (rawEvent.toolName || rawEvent.tool_name) as string | undefined;

  if (hookEvent && toolName) {
    return `${hookEvent}:${toolName}`;
  }
  if (hookEvent) {
    return hookEvent;
  }
  return "Unknown Event";
}

/** Get status from a FinalDecision tagged union */
function getStatusFromDecision(decision: FinalDecision | null): "ok" | "error" | "warning" {
  const decisionType = getFinalDecisionType(decision);
  if (decisionType === "Block" || decisionType === "Halt" || decisionType === "Deny") return "error";
  if (decisionType === "Ask") return "warning";
  return "ok";
}

/** Determine overall status from CupcakeSpan */
function getOverallStatus(span: CupcakeSpan): "ok" | "error" | "warning" {
  if (span.errors && span.errors.length > 0) return "error";

  // Check response for decision (if present as tagged union)
  const responseDecision = span.response?.decision as FinalDecision | undefined;
  if (responseDecision) {
    const status = getStatusFromDecision(responseDecision);
    if (status !== "ok") return status;
  }

  // Check phases for final decisions
  if (span.phases) {
    for (const phase of span.phases) {
      const status = getStatusFromDecision(phase.evaluation?.finalDecision);
      if (status !== "ok") return status;
    }
  }

  return "ok";
}

/** Get phase service name based on phase name */
function getPhaseServiceName(phaseName: string): string {
  if (phaseName === "global") return "Global";
  if (phaseName === "project") return "Project";
  if (phaseName.startsWith("catalog:")) return "Catalog";
  return "Phase";
}

/** Convert nanoseconds to relative microseconds */
function nanoToRelativeMicro(nano: number, baseNano: number): number {
  return Math.round((nano - baseNano) / 1000);
}

/** Convert milliseconds to microseconds */
function msToMicro(ms: number): number {
  return ms * 1000;
}

/** Calculate duration in microseconds from start/end nanoseconds */
function calculateDurationMicro(startNano: number, endNano: number): number {
  if (!startNano || !endNano || endNano <= startNano) return 1;
  return Math.round((endNano - startNano) / 1000);
}

/** Flatten a CupcakeSpan into an array of TraceSpans for D3 */
export function flattenCupcakeSpan(cupcake: CupcakeSpan): TraceSpan[] {
  const spans: TraceSpan[] = [];
  const baseTime = cupcake.startTimeUnixNano || 0;

  // Calculate root duration from timestamps (more reliable than duration_ms which can be 0)
  const rootDuration = calculateDurationMicro(
    cupcake.startTimeUnixNano,
    cupcake.endTimeUnixNano
  );

  // Root span - this is the full trace, must span the entire timeline
  spans.push({
    spanId: cupcake.spanId || "unknown",
    name: getEventName(cupcake.rawEvent || {}),
    serviceName: "Root",
    startTime: 0,
    duration: rootDuration,
    status: getOverallStatus(cupcake),
    data: {
      traceId: cupcake.traceId,
      harness: cupcake.harness,
      rawEvent: cupcake.rawEvent,
      response: cupcake.response,
      errors: cupcake.errors || [],
    },
  });

  // Enrich phase
  if (cupcake.enrich) {
    const enrich = cupcake.enrich;
    const enrichDuration = enrich.durationUs || calculateDurationMicro(
      enrich.startTimeUnixNano,
      enrich.endTimeUnixNano
    );
    spans.push({
      spanId: enrich.spanId || `${cupcake.spanId}-enrich`,
      parentId: cupcake.spanId,
      name: "Enriched Event",
      serviceName: "Enrich",
      startTime: nanoToRelativeMicro(enrich.startTimeUnixNano || baseTime, baseTime),
      duration: enrichDuration,
      status: "ok",
      data: {
        operations: enrich.operations || [],
        enrichedEvent: enrich.enrichedEvent,
      },
    });
  }

  // Policy phases
  for (const phase of cupcake.phases || []) {
    const phaseStartNano = phase.startTimeUnixNano || baseTime;
    const phaseEndNano = phase.endTimeUnixNano || cupcake.endTimeUnixNano || baseTime;
    const phaseStartTime = nanoToRelativeMicro(phaseStartNano, baseTime);
    const phaseDuration = calculateDurationMicro(phaseStartNano, phaseEndNano);

    // Phase span
    const phaseStatus = getStatusFromDecision(phase.evaluation?.finalDecision);

    spans.push({
      spanId: phase.spanId || `${cupcake.spanId}-phase`,
      parentId: cupcake.spanId,
      name: phase.name ? phase.name.charAt(0).toUpperCase() + phase.name.slice(1) : "Phase",
      serviceName: getPhaseServiceName(phase.name || ""),
      startTime: phaseStartTime,
      duration: phaseDuration,
      status: phaseStatus,
      data: {
        name: phase.name,
        evaluation: phase.evaluation,
      },
    });

    // Signals phase (if present)
    if (phase.signals) {
      const signals = phase.signals;
      const signalsStartNano = signals.startTimeUnixNano || phaseStartNano;
      const signalsEndNano = signals.endTimeUnixNano || phaseEndNano;
      const signalsStartTime = nanoToRelativeMicro(signalsStartNano, baseTime);
      const signalsDuration = calculateDurationMicro(signalsStartNano, signalsEndNano);

      spans.push({
        spanId: signals.spanId || `${phase.spanId}-signals`,
        parentId: phase.spanId,
        name: `Signals (${signals.signals?.length || 0})`,
        serviceName: "Signals",
        startTime: signalsStartTime,
        duration: signalsDuration,
        status: "ok",
        data: {
          signals: signals.signals || [],
        },
      });

      // Individual signal executions
      let signalOffset = 0;
      for (let i = 0; i < (signals.signals?.length || 0); i++) {
        const signal = signals.signals[i];
        const signalDuration = signal.durationMs ? msToMicro(signal.durationMs) : Math.max(1, Math.floor(signalsDuration / (signals.signals?.length || 1)));

        spans.push({
          spanId: `${signals.spanId}-signal-${i}`,
          parentId: signals.spanId,
          name: signal.name,
          serviceName: "Signal",
          startTime: signalsStartTime + signalOffset,
          duration: signalDuration,
          status: signal.exitCode === 0 || signal.exitCode === null ? "ok" : "error",
          data: signal,
        });

        signalOffset += signalDuration;
      }
    }

    // Evaluation span - NOTE: evaluation has no timing fields in the JSON,
    // so we position it at the end of the phase and give it a small slice
    const eval_ = phase.evaluation;
    if (eval_) {
      const evalDecisionType = getFinalDecisionType(eval_.finalDecision);
      // Evaluation happens at end of phase, give it ~20% of phase duration
      const evalDuration = Math.max(1, Math.floor(phaseDuration * 0.2));
      const evalStartTime = phaseStartTime + phaseDuration - evalDuration;

      spans.push({
        spanId: eval_.spanId || `${phase.spanId}-eval`,
        parentId: phase.spanId,
        name: evalDecisionType
          ? `Eval: ${evalDecisionType}`
          : eval_.exitReason
          ? `Exit: ${eval_.exitReason.slice(0, 20)}`
          : "Evaluation",
        serviceName: "Evaluation",
        startTime: evalStartTime,
        duration: evalDuration,
        status: phaseStatus,
        data: {
          routed: eval_.routed,
          matchedPolicies: eval_.matchedPolicies,
          exitReason: eval_.exitReason,
          wasmDecisionSet: eval_.wasmDecisionSet,
          finalDecision: eval_.finalDecision,
          finalDecisionType: evalDecisionType,
        },
      });
    }
  }

  return spans;
}

/** Get decision badge color class */
export function getDecisionBadgeClass(decision: string | null): string {
  switch (decision?.toLowerCase()) {
    case "allow":
      return "bg-green-500/20 text-green-600 dark:text-green-400";
    case "block":
    case "halt":
    case "deny":
      return "bg-red-500/20 text-red-600 dark:text-red-400";
    case "ask":
      return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400";
    case "skip":
    case "modify":
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Format duration for display */
export function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Convert snake_case to camelCase */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

/** Recursively convert object keys from snake_case to camelCase */
export function snakeToCamelKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map(snakeToCamelKeys) as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[snakeToCamel(key)] = snakeToCamelKeys(value);
    }
    return result as T;
  }
  return obj as T;
}
