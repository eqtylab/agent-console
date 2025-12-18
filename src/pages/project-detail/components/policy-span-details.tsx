import { cn } from "@/lib/utils";
import type { CupcakeSpan, SignalExecution, DecisionResult } from "@/lib/types";
import { type TraceSpan, getDecisionBadgeClass, formatDuration, getSpanColor } from "../policy-utils";
import { JsonViewer } from "./json-viewer";

interface PolicySpanDetailsProps {
  span: TraceSpan | null;
  cupcakeSpan: CupcakeSpan | null;
}

export function PolicySpanDetails({ span, cupcakeSpan }: PolicySpanDetailsProps) {
  if (!span) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-4 border-t border-border bg-background">
        <p className="text-sm">Select a span to view details</p>
      </div>
    );
  }

  const durationMs = span.duration / 1000;
  const data = span.data as Record<string, unknown> | undefined;

  return (
    <div className="h-full flex flex-col bg-background border-t border-border overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="size-3 rounded-full shrink-0"
            style={{ backgroundColor: getSpanColor(span) }}
          />
          <h2 className="text-sm font-medium truncate">{span.name}</h2>
        </div>
        <span
          className={cn(
            "text-xs font-medium",
            span.status === "error"
              ? "text-red-500"
              : span.status === "warning"
              ? "text-yellow-500"
              : "text-green-500"
          )}
        >
          {span.status === "error" ? "Error" : span.status === "warning" ? "Warning" : "OK"}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Timing & Type */}
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Duration: </span>
            <span className="font-medium">{formatDuration(durationMs)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Type: </span>
            <span className="font-medium">{span.serviceName}</span>
          </div>
        </div>

        {/* Span ID */}
        <div className="text-xs">
          <span className="text-muted-foreground">Span ID: </span>
          <span className="font-mono">{span.spanId}</span>
        </div>

        {/* Phase-specific details */}
        {span.serviceName === "Root" && data && (
          <RootDetails data={data} cupcakeSpan={cupcakeSpan} />
        )}

        {span.serviceName === "Enrich" && data && (
          <EnrichDetails data={data} />
        )}

        {(span.serviceName === "Global" ||
          span.serviceName === "Project" ||
          span.serviceName === "Catalog") &&
          data && <PhaseDetails data={data} />}

        {span.serviceName === "Signals" && data && (
          <SignalsDetails data={data} />
        )}

        {span.serviceName === "Signal" && data && (
          <SignalDetails data={data as unknown as SignalExecution} />
        )}

        {span.serviceName === "Evaluation" && data && (
          <EvaluationDetails data={data} />
        )}
      </div>
    </div>
  );
}

function RootDetails({
  data,
  cupcakeSpan,
}: {
  data: Record<string, unknown>;
  cupcakeSpan: CupcakeSpan | null;
}) {
  const rawEvent = data.rawEvent as Record<string, unknown> | undefined;
  const response = data.response as Record<string, unknown> | undefined;
  const errors = data.errors as string[] | undefined;

  return (
    <>
      {/* Raw Event */}
      {rawEvent && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Raw Event</p>
          <div className="bg-muted/30 p-2 rounded text-xs">
            <JsonViewer data={rawEvent} defaultExpanded isRoot />
          </div>
        </div>
      )}

      {/* Response */}
      {response && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Response</p>
          <div className="bg-muted/30 p-2 rounded text-xs">
            <JsonViewer data={response} defaultExpanded isRoot />
          </div>
        </div>
      )}

      {/* Errors */}
      {errors && errors.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-red-500">Errors</p>
          <ul className="text-xs space-y-1">
            {errors.map((err, i) => (
              <li key={i} className="text-red-400 font-mono">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trace info */}
      {cupcakeSpan && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-medium">Harness:</span> {cupcakeSpan.harness}
          </p>
          <p>
            <span className="font-medium">Trace ID:</span>{" "}
            <span className="font-mono">{cupcakeSpan.traceId}</span>
          </p>
        </div>
      )}
    </>
  );
}

function EnrichDetails({ data }: { data: Record<string, unknown> }) {
  const operations = data.operations as string[] | undefined;
  const enrichedEvent = data.enrichedEvent as Record<string, unknown> | undefined;

  return (
    <>
      {/* Operations */}
      {operations && operations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Operations</p>
          <div className="flex flex-wrap gap-1">
            {operations.map((op, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-[0.65rem] bg-emerald-500/20 text-emerald-500 rounded"
              >
                {op}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Enriched Event */}
      {enrichedEvent && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Enriched Event
          </p>
          <div className="bg-muted/30 p-2 rounded text-xs">
            <JsonViewer data={enrichedEvent} defaultExpanded isRoot />
          </div>
        </div>
      )}
    </>
  );
}

function PhaseDetails({ data }: { data: Record<string, unknown> }) {
  const evaluation = data.evaluation as Record<string, unknown> | undefined;

  if (!evaluation) return null;

  const routed = evaluation.routed as boolean;
  const matchedPolicies = evaluation.matchedPolicies as string[] | undefined;
  const exitReason = evaluation.exitReason as string | undefined;
  const finalDecision = evaluation.finalDecisionType as string | undefined;

  return (
    <>
      {/* Routing */}
      <div className="text-xs">
        <span className="text-muted-foreground">Routed: </span>
        <span className={routed ? "text-green-500" : "text-muted-foreground"}>
          {routed ? "Yes" : "No"}
        </span>
      </div>

      {/* Matched Policies */}
      {matchedPolicies && matchedPolicies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Matched Policies
          </p>
          <div className="flex flex-wrap gap-1">
            {matchedPolicies.map((policy, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-[0.65rem] bg-blue-500/20 text-blue-400 rounded font-mono"
              >
                {policy}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Exit Reason */}
      {exitReason && (
        <div className="text-xs">
          <span className="text-muted-foreground">Exit: </span>
          <span className="text-yellow-500">{exitReason}</span>
        </div>
      )}

      {/* Final Decision */}
      {finalDecision && (
        <div className="text-xs">
          <span className="text-muted-foreground">Decision: </span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded font-medium",
              getDecisionBadgeClass(finalDecision)
            )}
          >
            {finalDecision}
          </span>
        </div>
      )}
    </>
  );
}

function SignalsDetails({ data }: { data: Record<string, unknown> }) {
  const signals = data.signals as SignalExecution[] | undefined;

  if (!signals || signals.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Signals ({signals.length})
      </p>
      <div className="space-y-1.5">
        {signals.map((signal, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs bg-muted/30 px-2 py-1 rounded"
          >
            <span className="font-mono truncate">{signal.name}</span>
            {signal.durationMs && (
              <span className="text-muted-foreground shrink-0">
                {formatDuration(signal.durationMs)}
              </span>
            )}
            {signal.exitCode !== null && (
              <span
                className={cn(
                  "shrink-0",
                  signal.exitCode === 0 ? "text-green-500" : "text-red-500"
                )}
              >
                [{signal.exitCode}]
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalDetails({ data }: { data: SignalExecution }) {
  return (
    <>
      {/* Command */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Command</p>
        <div className="text-xs bg-muted/30 px-2 py-1 rounded font-mono truncate">
          {data.command}
        </div>
      </div>

      {/* Exit Code */}
      {data.exitCode !== null && (
        <div className="text-xs">
          <span className="text-muted-foreground">Exit Code: </span>
          <span
            className={data.exitCode === 0 ? "text-green-500" : "text-red-500"}
          >
            {data.exitCode}
          </span>
        </div>
      )}

      {/* Result */}
      {data.result !== undefined && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Result</p>
          {typeof data.result === "string" ? (
            <pre className="text-xs bg-muted/30 p-2 rounded overflow-auto max-h-24 font-mono whitespace-pre-wrap break-all">
              {data.result}
            </pre>
          ) : (
            <div className="bg-muted/30 p-2 rounded text-xs">
              <JsonViewer data={data.result} defaultExpanded isRoot />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function EvaluationDetails({ data }: { data: Record<string, unknown> }) {
  const routed = data.routed as boolean;
  const matchedPolicies = data.matchedPolicies as string[] | undefined;
  const exitReason = data.exitReason as string | undefined;
  const finalDecision = data.finalDecisionType as string | undefined;
  const wasmDecisionSet = data.wasmDecisionSet as Record<string, unknown> | undefined;

  return (
    <>
      {/* Routing */}
      <div className="text-xs">
        <span className="text-muted-foreground">Routed: </span>
        <span className={routed ? "text-green-500" : "text-muted-foreground"}>
          {routed ? "Yes" : "No"}
        </span>
      </div>

      {/* Matched Policies */}
      {matchedPolicies && matchedPolicies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Matched Policies
          </p>
          <div className="flex flex-wrap gap-1">
            {matchedPolicies.map((policy, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-[0.65rem] bg-blue-500/20 text-blue-400 rounded font-mono"
              >
                {policy}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Exit Reason */}
      {exitReason && (
        <div className="text-xs">
          <span className="text-muted-foreground">Exit Reason: </span>
          <span className="text-yellow-500">{exitReason}</span>
        </div>
      )}

      {/* WASM Decision Set */}
      {wasmDecisionSet && (
        <WasmDecisionSetDetails decisionSet={wasmDecisionSet} />
      )}

      {/* Final Decision */}
      {finalDecision && (
        <div className="text-xs mt-2">
          <span className="text-muted-foreground">Final: </span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded font-medium",
              getDecisionBadgeClass(finalDecision)
            )}
          >
            {finalDecision}
          </span>
        </div>
      )}
    </>
  );
}

function WasmDecisionSetDetails({
  decisionSet,
}: {
  decisionSet: Record<string, unknown>;
}) {
  const halts = decisionSet.halts as DecisionResult[] | undefined;
  const denials = decisionSet.denials as DecisionResult[] | undefined;
  const blocks = decisionSet.blocks as DecisionResult[] | undefined;
  const asks = decisionSet.asks as DecisionResult[] | undefined;

  const hasDecisions =
    (halts && halts.length > 0) ||
    (denials && denials.length > 0) ||
    (blocks && blocks.length > 0) ||
    (asks && asks.length > 0);

  if (!hasDecisions) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        WASM Decisions
      </p>

      {halts && halts.length > 0 && (
        <DecisionList label="Halts" decisions={halts} color="red" />
      )}

      {denials && denials.length > 0 && (
        <DecisionList label="Denials" decisions={denials} color="red" />
      )}

      {blocks && blocks.length > 0 && (
        <DecisionList label="Blocks" decisions={blocks} color="red" />
      )}

      {asks && asks.length > 0 && (
        <DecisionList label="Asks" decisions={asks} color="yellow" />
      )}
    </div>
  );
}

function DecisionList({
  label,
  decisions,
  color,
}: {
  label: string;
  decisions: DecisionResult[];
  color: "red" | "yellow";
}) {
  return (
    <div className="space-y-1">
      <p
        className={cn(
          "text-[0.65rem] font-medium",
          color === "red" ? "text-red-500" : "text-yellow-500"
        )}
      >
        {label} ({decisions.length})
      </p>
      <div className="space-y-1">
        {decisions.map((d, i) => (
          <div
            key={i}
            className={cn(
              "text-xs px-2 py-1 rounded border-l-2",
              color === "red"
                ? "bg-red-500/10 border-red-500"
                : "bg-yellow-500/10 border-yellow-500"
            )}
          >
            <div className="font-mono text-[0.65rem] text-muted-foreground">
              [{d.ruleId}]
            </div>
            <div className="mt-0.5">{d.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
