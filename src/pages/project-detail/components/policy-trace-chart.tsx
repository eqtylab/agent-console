import { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import { type TraceSpan, getSpanColor } from "../policy-utils";

interface PolicyTraceChartProps {
  spans: TraceSpan[];
  selectedSpanId?: string;
  onSpanSelect: (span: TraceSpan | null) => void;
}

interface ProcessedSpan extends TraceSpan {
  row: number;
  depth: number;
}

const CHART_CONSTANTS = {
  ROW_HEIGHT: 28,
  MIN_BAR_WIDTH: 3,
};

// CSS variable references for theming
const CSS_VARS = {
  TEXT_COLOR: "var(--color-foreground)",
  MUTED_TEXT_COLOR: "var(--color-muted-foreground)",
  BG_COLOR: "var(--color-background)",
  BORDER_COLOR: "var(--color-border)",
};

/** Process spans into rows with depth based on parent relationships */
function processSpans(spans: TraceSpan[]): ProcessedSpan[] {
  const processed: ProcessedSpan[] = [];
  const spanMap = new Map<string, TraceSpan>();

  for (const span of spans) {
    spanMap.set(span.spanId, span);
  }

  function getDepth(span: TraceSpan): number {
    if (!span.parentId) return 0;
    const parent = spanMap.get(span.parentId);
    if (!parent) return 0;
    return getDepth(parent) + 1;
  }

  // Sort by start time, but keep parent-child ordering
  const sorted = [...spans].sort((a, b) => {
    const depthA = getDepth(a);
    const depthB = getDepth(b);
    if (depthA !== depthB) return depthA - depthB;
    return a.startTime - b.startTime;
  });

  // Build tree structure for proper row assignment
  const rootSpans = sorted.filter((s) => !s.parentId);
  let row = 0;

  function processSubtree(span: TraceSpan, depth: number) {
    processed.push({ ...span, row, depth });
    row++;

    const children = sorted.filter((s) => s.parentId === span.spanId);
    for (const child of children) {
      processSubtree(child, depth + 1);
    }
  }

  for (const root of rootSpans) {
    processSubtree(root, 0);
  }

  return processed;
}

export function PolicyTraceChart({
  spans,
  selectedSpanId,
  onSpanSelect,
}: PolicyTraceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const processedData = useMemo(() => processSpans(spans), [spans]);

  const timeRange = useMemo(() => {
    if (spans.length === 0) return { start: 0, end: 1000 };
    let minStart = Infinity;
    let maxEnd = 0;
    for (const span of spans) {
      minStart = Math.min(minStart, span.startTime);
      maxEnd = Math.max(maxEnd, span.startTime + span.duration);
    }
    // Ensure we have a reasonable range
    if (maxEnd <= minStart) maxEnd = minStart + 1000;
    return { start: minStart, end: maxEnd };
  }, [spans]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      requestAnimationFrame(() => {
        if (!entries[0]) return;
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height,
        });
      });
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Scroll handling for sticky elements
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const top = container.scrollTop;
      d3.select(svgRef.current)
        .selectAll(".sticky-element")
        .attr("transform", `translate(0, ${top})`);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // D3 Rendering
  useEffect(() => {
    if (!svgRef.current || !processedData.length || dimensions.width === 0)
      return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 40, right: 16, bottom: 8, left: 200 };
    const width = dimensions.width;
    const rowHeight = CHART_CONSTANTS.ROW_HEIGHT;

    const contentHeight = processedData.length * rowHeight;
    const totalSVGHeight = contentHeight + margin.top + 20;

    svg
      .attr("width", width)
      .attr("height", Math.max(dimensions.height, totalSVGHeight))
      .style("font-family", "ui-monospace, monospace")
      .style("background-color", CSS_VARS.BG_COLOR)
      .style("display", "block");

    // Defs for clipping
    const defs = svg.append("defs");

    defs
      .append("clipPath")
      .attr("id", "chart-clip")
      .append("rect")
      .attr("x", margin.left)
      .attr("y", 0)
      .attr("width", Math.max(0, width - margin.left - margin.right))
      .attr("height", totalSVGHeight);

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([timeRange.start, timeRange.end])
      .range([margin.left, width - margin.right]);

    // --- LAYER 1: Sticky Grid Lines (Background) ---
    const stickyGridGroup = svg
      .append("g")
      .attr("class", "sticky-element grid-lines")
      .attr("transform", "translate(0, 0)");

    const gridAxis = d3
      .axisTop(xScale)
      .ticks(Math.floor(width / 100))
      .tickFormat(() => "")
      .tickSize(-dimensions.height);

    stickyGridGroup.call(gridAxis);
    stickyGridGroup.select(".domain").remove();
    stickyGridGroup
      .selectAll(".tick line")
      .attr("stroke", CSS_VARS.BORDER_COLOR)
      .attr("stroke-dasharray", "2,2");

    // --- LAYER 2: Scrollable Content ---
    const contentGroup = svg
      .append("g")
      .attr("class", "content-group")
      .attr("transform", `translate(0, ${margin.top})`);

    // Row backgrounds
    const rowGroup = contentGroup.append("g");
    const rows = rowGroup
      .selectAll<SVGGElement, ProcessedSpan>(".row-bg")
      .data(processedData)
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(0, ${d.row * rowHeight})`);

    rows
      .append("rect")
      .attr("width", width)
      .attr("height", rowHeight)
      .attr("fill", (d) =>
        d.spanId === selectedSpanId ? "rgba(59, 130, 246, 0.1)" : "transparent"
      )
      .style("cursor", "pointer")
      .on("mouseover", function (this: SVGRectElement, _e, d) {
        d3.select(this).attr(
          "fill",
          d.spanId === selectedSpanId
            ? "rgba(59, 130, 246, 0.15)"
            : "rgba(255,255,255,0.02)"
        );
      })
      .on("mouseout", function (this: SVGRectElement, _e, d) {
        d3.select(this).attr(
          "fill",
          d.spanId === selectedSpanId ? "rgba(59, 130, 246, 0.1)" : "transparent"
        );
      })
      .on("click", (_e, d) => onSpanSelect(d));

    rows
      .append("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", rowHeight)
      .attr("y2", rowHeight)
      .attr("stroke", CSS_VARS.BORDER_COLOR)
      .attr("stroke-width", 1);

    // Bars (clipped to chart area)
    const barsGroup = contentGroup
      .append("g")
      .attr("clip-path", "url(#chart-clip)");

    const barRows = barsGroup
      .selectAll<SVGGElement, ProcessedSpan>(".bar-row")
      .data(processedData)
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(0, ${d.row * rowHeight})`)
      .style("pointer-events", "none");

    barRows
      .append("rect")
      .attr("class", "span-rect")
      .attr("x", (d) => Math.max(margin.left, xScale(d.startTime)))
      .attr("y", 5)
      .attr("height", rowHeight - 10)
      .attr("width", (d) => {
        const xStart = Math.max(margin.left, xScale(d.startTime));
        const xEnd = Math.max(xStart, xScale(d.startTime + d.duration));
        return Math.max(CHART_CONSTANTS.MIN_BAR_WIDTH, xEnd - xStart);
      })
      .attr("rx", 2)
      .attr("fill", (d) => getSpanColor(d))
      .attr("stroke", (d) => (d.status === "error" ? "var(--color-destructive)" : "none"))
      .attr("stroke-width", (d) => (d.status === "error" ? 1.5 : 0))
      .style("opacity", 0.9);

    // Sidebar content (labels)
    const sidebarGroup = contentGroup
      .append("g")
      .style("pointer-events", "none");

    const sidebarRows = sidebarGroup
      .selectAll<SVGGElement, ProcessedSpan>(".sidebar-row")
      .data(processedData)
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(0, ${d.row * rowHeight})`);

    const labelGroup = sidebarRows
      .append("g")
      .attr("transform", `translate(12, ${rowHeight / 2})`);

    labelGroup
      .append("circle")
      .attr("cx", (d) => d.depth * 12)
      .attr("cy", 0)
      .attr("r", 3)
      .attr("fill", (d) => getSpanColor(d));

    labelGroup
      .append("text")
      .attr("x", (d) => d.depth * 12 + 8)
      .attr("y", 4)
      .text((d) => d.name)
      .attr("fill", (d) =>
        d.status === "error" ? "var(--color-destructive)" : CSS_VARS.TEXT_COLOR
      )
      .style("font-size", "11px");

    // Duration labels
    sidebarRows
      .append("text")
      .attr("x", margin.left - 12)
      .attr("y", rowHeight / 2 + 3)
      .attr("text-anchor", "end")
      .text((d) => {
        const us = d.duration;
        const ms = us / 1000;
        if (ms >= 1) {
          return `${ms.toFixed(1)}ms`;
        } else if (us >= 1) {
          return `${us.toFixed(0)}µs`;
        } else {
          return "<1µs";
        }
      })
      .attr("fill", CSS_VARS.MUTED_TEXT_COLOR)
      .style("font-size", "10px");

    // --- LAYER 3: Sticky Header (Foreground) ---
    const stickyHeaderGroup = svg
      .append("g")
      .attr("class", "sticky-element header-group")
      .attr("transform", "translate(0, 0)");

    // Header background
    stickyHeaderGroup
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", width)
      .attr("height", margin.top)
      .attr("fill", CSS_VARS.BG_COLOR);

    // Axis
    const stickyAxisGroup = stickyHeaderGroup
      .append("g")
      .attr("class", "axis-labels")
      .attr("transform", `translate(0, ${margin.top})`);

    // Format time values - use µs for small ranges, ms for larger
    const range = timeRange.end - timeRange.start;
    const formatTime = (domainValue: d3.AxisDomain, _index: number): string => {
      const d = Number(domainValue);
      const val = d - timeRange.start;
      if (val === 0) return "0";
      if (range < 1000) {
        // Sub-millisecond range: show microseconds
        return `${val.toFixed(0)}µs`;
      } else if (range < 10000) {
        // 1-10ms range: show with decimal
        return `${(val / 1000).toFixed(1)}ms`;
      } else {
        // Larger range: show whole milliseconds
        return `${(val / 1000).toFixed(0)}ms`;
      }
    };

    const axis = d3
      .axisTop(xScale)
      .ticks(Math.floor(width / 100))
      .tickFormat(formatTime)
      .tickSize(6);

    stickyAxisGroup.call(axis);
    stickyAxisGroup.select(".domain").remove();
    stickyAxisGroup.selectAll(".tick line").attr("stroke", CSS_VARS.BORDER_COLOR);
    stickyAxisGroup
      .selectAll(".tick text")
      .attr("fill", CSS_VARS.MUTED_TEXT_COLOR)
      .style("font-size", "9px");

    // Header labels
    stickyHeaderGroup
      .append("text")
      .attr("x", 12)
      .attr("y", margin.top - 12)
      .text("Span")
      .attr("fill", CSS_VARS.MUTED_TEXT_COLOR)
      .style("font-size", "10px")
      .style("font-weight", "500");

    stickyHeaderGroup
      .append("text")
      .attr("x", margin.left - 12)
      .attr("y", margin.top - 12)
      .attr("text-anchor", "end")
      .text("Duration")
      .attr("fill", CSS_VARS.MUTED_TEXT_COLOR)
      .style("font-size", "10px")
      .style("font-weight", "500");

    // Header border
    stickyHeaderGroup
      .append("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", margin.top)
      .attr("y2", margin.top)
      .attr("stroke", CSS_VARS.BORDER_COLOR)
      .attr("stroke-width", 1);

    // Vertical sidebar divider
    stickyHeaderGroup
      .append("line")
      .attr("x1", margin.left)
      .attr("x2", margin.left)
      .attr("y1", 0)
      .attr("y2", dimensions.height)
      .attr("stroke", CSS_VARS.BORDER_COLOR)
      .attr("stroke-width", 1);

    // --- Zoom Behavior ---
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 100])
      .translateExtent([
        [0, 0],
        [width * 2, totalSVGHeight],
      ])
      .extent([
        [0, 0],
        [width, dimensions.height],
      ])
      .filter((event) => {
        // Allow native vertical scroll unless Ctrl/Meta is pressed for zooming
        if (event.type === "wheel") {
          return event.ctrlKey || event.metaKey;
        }
        return true;
      })
      .on("zoom", (event) => {
        const newXScale = event.transform.rescaleX(xScale);

        // Update grid
        stickyGridGroup.call(
          d3
            .axisTop(newXScale)
            .ticks(Math.floor(width / 100))
            .tickFormat(() => "")
            .tickSize(-dimensions.height)
        );
        stickyGridGroup.select(".domain").remove();
        stickyGridGroup
          .selectAll(".tick line")
          .attr("stroke", CSS_VARS.BORDER_COLOR)
          .attr("stroke-dasharray", "2,2");

        // Update axis
        stickyAxisGroup.call(
          d3
            .axisTop(newXScale)
            .ticks(Math.floor(width / 100))
            .tickFormat(formatTime)
            .tickSize(6)
        );
        stickyAxisGroup.select(".domain").remove();
        stickyAxisGroup.selectAll(".tick line").attr("stroke", CSS_VARS.BORDER_COLOR);
        stickyAxisGroup
          .selectAll(".tick text")
          .attr("fill", CSS_VARS.MUTED_TEXT_COLOR)
          .style("font-size", "9px");

        // Update bars
        barsGroup
          .selectAll<SVGRectElement, ProcessedSpan>(".span-rect")
          .attr("x", (d) => Math.max(margin.left, newXScale(d.startTime)))
          .attr("width", (d) => {
            const xStart = Math.max(margin.left, newXScale(d.startTime));
            const xEnd = Math.max(xStart, newXScale(d.startTime + d.duration));
            return Math.max(CHART_CONSTANTS.MIN_BAR_WIDTH, xEnd - xStart);
          });
      });

    svg.call(zoom).on("dblclick.zoom", null);
  }, [processedData, dimensions, timeRange, selectedSpanId, onSpanSelect]);

  if (spans.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground bg-background">
        <p className="text-sm">No spans to display</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative select-none bg-background overflow-y-auto overflow-x-hidden"
    >
      <svg ref={svgRef} className="block" />
    </div>
  );
}
