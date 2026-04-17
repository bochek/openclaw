import crypto from "node:crypto";

export type E2ETraceMode = "off" | "on" | "once";
export type E2ETraceSpanStatus = "ok" | "error" | "skipped";
export type E2ETraceAttrValue = string | number | boolean;
export type E2ETraceSpanKey =
  | "gateway_ingress"
  | "queue_wait"
  | "pre_turn_hooks"
  | "active_memory"
  | "prompt_build"
  | "agent_model"
  | "agent_tools"
  | "reply_render"
  | "delivery"
  | "gateway_egress";

export type E2ETraceSpan = {
  key: E2ETraceSpanKey;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  status: E2ETraceSpanStatus;
  attrs?: Record<string, E2ETraceAttrValue>;
};

export type E2ETraceToolSummary = {
  name: string;
  calls: number;
  totalMs: number;
  maxMs?: number;
};

export type E2ETrace = {
  traceId: string;
  version: 1;
  totalDurationMs: number;
  spans: E2ETraceSpan[];
  summary: {
    gatewayIngressMs?: number;
    queueWaitMs?: number;
    preTurnHooksMs?: number;
    activeMemoryMs?: number;
    promptBuildMs?: number;
    modelMs?: number;
    toolsMs?: number;
    replyRenderMs?: number;
    deliveryMs?: number;
    gatewayEgressMs?: number;
  };
  topSlowTools?: E2ETraceToolSummary[];
  stopReason?: string;
};

type MutableSpan = {
  key: E2ETraceSpanKey;
  startedAt: number;
  endedAt?: number;
  status?: E2ETraceSpanStatus;
  attrs?: Record<string, E2ETraceAttrValue>;
};

export type E2ETraceCollector = {
  traceId: string;
  rootStartedAt: number;
  spans: Map<E2ETraceSpanKey, MutableSpan>;
  topSlowTools?: E2ETraceToolSummary[];
  stopReason?: string;
  finalTrace?: E2ETrace;
};

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function mergeAttrs(
  existing: Record<string, E2ETraceAttrValue> | undefined,
  incoming: Record<string, E2ETraceAttrValue> | undefined,
): Record<string, E2ETraceAttrValue> | undefined {
  if (!incoming || Object.keys(incoming).length === 0) {
    return existing;
  }
  return { ...existing, ...incoming };
}

function ensureSpan(
  collector: E2ETraceCollector,
  key: E2ETraceSpanKey,
  startedAt: number,
): MutableSpan {
  const existing = collector.spans.get(key);
  if (existing) {
    if (startedAt < existing.startedAt) {
      existing.startedAt = startedAt;
    }
    return existing;
  }
  const created: MutableSpan = { key, startedAt };
  collector.spans.set(key, created);
  return created;
}

export function createE2ETraceCollector(params?: {
  traceId?: string;
  rootStartedAt?: number;
}): E2ETraceCollector {
  const rootStartedAt = isFinitePositiveNumber(params?.rootStartedAt)
    ? params.rootStartedAt
    : Date.now();
  return {
    traceId: params?.traceId?.trim() || crypto.randomUUID(),
    rootStartedAt,
    spans: new Map(),
  };
}

export function startE2ETraceSpan(
  collector: E2ETraceCollector | undefined,
  key: E2ETraceSpanKey,
  options?: {
    startedAt?: number;
    attrs?: Record<string, E2ETraceAttrValue>;
  },
) {
  if (!collector) {
    return;
  }
  const startedAt = isFinitePositiveNumber(options?.startedAt) ? options.startedAt : Date.now();
  const span = ensureSpan(collector, key, startedAt);
  span.attrs = mergeAttrs(span.attrs, options?.attrs);
}

export function endE2ETraceSpan(
  collector: E2ETraceCollector | undefined,
  key: E2ETraceSpanKey,
  options?: {
    endedAt?: number;
    status?: E2ETraceSpanStatus;
    attrs?: Record<string, E2ETraceAttrValue>;
  },
) {
  if (!collector) {
    return;
  }
  const endedAt = isFinitePositiveNumber(options?.endedAt) ? options.endedAt : Date.now();
  const span = ensureSpan(collector, key, endedAt);
  span.endedAt = endedAt;
  span.status = options?.status ?? span.status ?? "ok";
  span.attrs = mergeAttrs(span.attrs, options?.attrs);
}

export function recordMeasuredE2ETraceSpan(
  collector: E2ETraceCollector | undefined,
  key: E2ETraceSpanKey,
  options: {
    durationMs: number;
    endedAt?: number;
    status?: E2ETraceSpanStatus;
    attrs?: Record<string, E2ETraceAttrValue>;
  },
) {
  if (!collector || !isFinitePositiveNumber(options.durationMs)) {
    return;
  }
  const endedAt = isFinitePositiveNumber(options.endedAt) ? options.endedAt : Date.now();
  const startedAt = Math.max(collector.rootStartedAt, endedAt - Math.round(options.durationMs));
  const span = ensureSpan(collector, key, startedAt);
  if (startedAt < span.startedAt) {
    span.startedAt = startedAt;
  }
  span.endedAt = span.endedAt && span.endedAt > endedAt ? span.endedAt : endedAt;
  span.status = options.status ?? span.status ?? "ok";
  span.attrs = mergeAttrs(span.attrs, options.attrs);
}

export function noteE2ETraceToolSummary(
  collector: E2ETraceCollector | undefined,
  tools: E2ETraceToolSummary[] | undefined,
) {
  if (!collector || !tools || tools.length === 0) {
    return;
  }
  collector.topSlowTools = tools.map((tool) => ({ ...tool }));
}

export function noteE2ETraceStopReason(
  collector: E2ETraceCollector | undefined,
  stopReason: string | undefined,
) {
  if (!collector || !stopReason?.trim()) {
    return;
  }
  collector.stopReason = stopReason.trim();
}

function toSummaryDuration(
  spans: ReadonlyArray<Pick<E2ETraceSpan, "key" | "durationMs">>,
  key: E2ETraceSpanKey,
): number | undefined {
  return spans.find((span) => span.key === key)?.durationMs;
}

export function finalizeE2ETrace(
  collector: E2ETraceCollector | undefined,
  options?: {
    endedAt?: number;
  },
): E2ETrace | undefined {
  if (!collector) {
    return undefined;
  }
  const endedAt = isFinitePositiveNumber(options?.endedAt) ? options.endedAt : Date.now();
  const spans = Array.from(collector.spans.values())
    .filter((span) => span.endedAt && span.endedAt >= span.startedAt)
    .map((span) => ({
      key: span.key,
      startedAt: span.startedAt,
      endedAt: span.endedAt!,
      durationMs: Math.max(0, Math.round(span.endedAt! - span.startedAt)),
      status: span.status ?? "ok",
      ...(span.attrs && Object.keys(span.attrs).length > 0 ? { attrs: span.attrs } : {}),
    }))
    .toSorted((a, b) => a.startedAt - b.startedAt || a.key.localeCompare(b.key));
  if (spans.length === 0) {
    return undefined;
  }
  const trace: E2ETrace = {
    traceId: collector.traceId,
    version: 1,
    totalDurationMs: Math.max(0, Math.round(endedAt - collector.rootStartedAt)),
    spans,
    summary: {
      gatewayIngressMs: toSummaryDuration(spans, "gateway_ingress"),
      queueWaitMs: toSummaryDuration(spans, "queue_wait"),
      preTurnHooksMs: toSummaryDuration(spans, "pre_turn_hooks"),
      activeMemoryMs: toSummaryDuration(spans, "active_memory"),
      promptBuildMs: toSummaryDuration(spans, "prompt_build"),
      modelMs: toSummaryDuration(spans, "agent_model"),
      toolsMs: toSummaryDuration(spans, "agent_tools"),
      replyRenderMs: toSummaryDuration(spans, "reply_render"),
      deliveryMs: toSummaryDuration(spans, "delivery"),
      gatewayEgressMs: toSummaryDuration(spans, "gateway_egress"),
    },
    ...(collector.topSlowTools?.length ? { topSlowTools: collector.topSlowTools } : {}),
    ...(collector.stopReason ? { stopReason: collector.stopReason } : {}),
  };
  collector.finalTrace = trace;
  return trace;
}

export function hasGatewayE2ETraceCoverage(trace: E2ETrace | undefined): boolean {
  if (!trace) {
    return false;
  }
  const keys = new Set(trace.spans.map((span) => span.key));
  return keys.has("gateway_ingress") && keys.has("gateway_egress");
}

function formatDuration(durationMs: number | undefined): string | undefined {
  if (!isFinitePositiveNumber(durationMs)) {
    return undefined;
  }
  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`;
  }
  if (durationMs < 10_000) {
    return `${(durationMs / 1_000).toFixed(1)}s`;
  }
  return `${(durationMs / 1_000).toFixed(0)}s`;
}

export function formatE2ETraceForChat(trace: E2ETrace | undefined): string | undefined {
  if (!trace || !hasGatewayE2ETraceCoverage(trace)) {
    return undefined;
  }
  const lines = [
    "🔎 E2E Trace:",
    "~~~text",
    `total=${formatDuration(trace.totalDurationMs) ?? `${trace.totalDurationMs}ms`}`,
    trace.summary.gatewayIngressMs !== undefined
      ? `gateway_ingress=${formatDuration(trace.summary.gatewayIngressMs)}`
      : undefined,
    trace.summary.queueWaitMs !== undefined
      ? `queue_wait=${formatDuration(trace.summary.queueWaitMs)}`
      : undefined,
    trace.summary.preTurnHooksMs !== undefined
      ? `pre_turn_hooks=${formatDuration(trace.summary.preTurnHooksMs)}`
      : undefined,
    trace.summary.activeMemoryMs !== undefined
      ? `active_memory=${formatDuration(trace.summary.activeMemoryMs)}`
      : undefined,
    trace.summary.promptBuildMs !== undefined
      ? `prompt_build=${formatDuration(trace.summary.promptBuildMs)}`
      : undefined,
    trace.summary.modelMs !== undefined
      ? `model=${formatDuration(trace.summary.modelMs)}`
      : undefined,
    trace.summary.toolsMs !== undefined
      ? `tools=${formatDuration(trace.summary.toolsMs)}`
      : undefined,
    trace.summary.replyRenderMs !== undefined
      ? `reply_render=${formatDuration(trace.summary.replyRenderMs)}`
      : undefined,
    trace.summary.deliveryMs !== undefined
      ? `delivery=${formatDuration(trace.summary.deliveryMs)}`
      : undefined,
    trace.summary.gatewayEgressMs !== undefined
      ? `gateway_egress=${formatDuration(trace.summary.gatewayEgressMs)}`
      : undefined,
    trace.stopReason ? `stop=${trace.stopReason}` : undefined,
    ...(trace.topSlowTools?.length
      ? [
          "",
          "slowest tools:",
          ...trace.topSlowTools.map(
            (tool, index) =>
              `${index + 1}. ${tool.name} · ${formatDuration(tool.totalMs) ?? `${tool.totalMs}ms`} total · ${tool.calls} call${tool.calls === 1 ? "" : "s"}${tool.maxMs ? ` · max ${formatDuration(tool.maxMs)}` : ""}`,
          ),
        ]
      : []),
    "~~~",
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return lines.join("\n");
}
