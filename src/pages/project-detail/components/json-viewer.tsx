import { useState } from "react";
import {
  IconChevronRight,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { JsonViewerProps } from "../types";

function JsonValue({ value, onCopy }: { value: string; onCopy: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span
      className="relative inline-flex items-center group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span>{value}</span>
      {(hovered || copied) && (
        <button
          onClick={handleCopy}
          className={cn(
            "ml-1 p-0.5 rounded",
            copied
              ? "text-green-500"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
          title={copied ? "Copied!" : "Copy value"}
        >
          {copied ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
        </button>
      )}
    </span>
  );
}

export function JsonViewer({ data, label, defaultExpanded = false, isRoot = false }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (value: unknown, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle null
  if (data === null) {
    return (
      <span className="inline-flex items-center">
        {label && <span className="text-purple-600 dark:text-purple-400 mr-1">"{label}":</span>}
        <JsonValue value="null" onCopy={() => copyToClipboard(null)} />
      </span>
    );
  }

  // Handle undefined
  if (data === undefined) {
    return (
      <span className="inline-flex items-center">
        {label && <span className="text-purple-600 dark:text-purple-400 mr-1">"{label}":</span>}
        <span className="text-muted-foreground italic">undefined</span>
      </span>
    );
  }

  // Handle strings
  if (typeof data === 'string') {
    return (
      <span className="inline-flex items-start">
        {label && <span className="text-purple-600 dark:text-purple-400 mr-1 shrink-0">"{label}":</span>}
        <JsonValue
          value={`"${data}"`}
          onCopy={() => copyToClipboard(data)}
        />
      </span>
    );
  }

  // Handle numbers
  if (typeof data === 'number') {
    return (
      <span className="inline-flex items-center">
        {label && <span className="text-purple-600 dark:text-purple-400 mr-1">"{label}":</span>}
        <JsonValue
          value={String(data)}
          onCopy={() => copyToClipboard(data)}
        />
      </span>
    );
  }

  // Handle booleans
  if (typeof data === 'boolean') {
    return (
      <span className="inline-flex items-center">
        {label && <span className="text-purple-600 dark:text-purple-400 mr-1">"{label}":</span>}
        <JsonValue
          value={String(data)}
          onCopy={() => copyToClipboard(data)}
        />
      </span>
    );
  }

  // Handle arrays and objects
  const isArray = Array.isArray(data);
  const entries = isArray ? data.map((v, i) => [String(i), v] as const) : Object.entries(data as object);
  const isEmpty = entries.length === 0;
  const bracketOpen = isArray ? '[' : '{';
  const bracketClose = isArray ? ']' : '}';

  if (isEmpty) {
    return (
      <span className="inline-flex items-center">
        {label && <span className="text-purple-600 dark:text-purple-400 mr-1">"{label}":</span>}
        <JsonValue value={`${bracketOpen}${bracketClose}`} onCopy={() => copyToClipboard(data)} />
      </span>
    );
  }

  return (
    <div className={cn(!isRoot && "ml-4")}>
      <span
        className="group cursor-pointer hover:bg-muted/50 rounded px-0.5 -mx-0.5 inline-flex items-center gap-1"
        onClick={() => setExpanded(!expanded)}
      >
        <IconChevronRight className={cn("size-3 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        {label && <span className="text-purple-600 dark:text-purple-400">"{label}":</span>}
        <span className="text-muted-foreground">{bracketOpen}</span>
        {!expanded && (
          <>
            <span className="text-muted-foreground/60 text-xs">{entries.length} {isArray ? 'items' : 'keys'}</span>
            <span className="text-muted-foreground">{bracketClose}</span>
          </>
        )}
        <button
          onClick={(e) => copyToClipboard(data, e)}
          className={cn(
            "p-0.5 rounded",
            copied
              ? "text-green-500"
              : "hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
          )}
          title={copied ? "Copied!" : "Copy object"}
        >
          {copied ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
        </button>
      </span>

      {expanded && (
        <div className="border-l border-border/50 ml-1.5 pl-2">
          {entries.map(([key, value], index) => (
            <div key={key} className="group">
              <JsonViewer
                label={isArray ? undefined : key}
                data={value}
                defaultExpanded={defaultExpanded}
              />
              {index < entries.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
          <div className="text-muted-foreground">{bracketClose}</div>
        </div>
      )}
    </div>
  );
}

export function JsonViewerRoot({ json }: { json: string }) {
  try {
    const data = JSON.parse(json);
    return (
      <div className="text-xs font-mono">
        <JsonViewer data={data} defaultExpanded={true} isRoot={true} />
      </div>
    );
  } catch {
    return <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all">{json}</pre>;
  }
}
