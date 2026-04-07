import crypto from "node:crypto";
import { formatErrorMessage } from "../infra/errors.js";
import {
  completeTaskRunByRunId,
  createRunningTaskRun,
  failTaskRunByRunId,
  recordTaskRunProgressByRunId,
} from "../tasks/task-executor.js";
import type {
  TaskDeliveryState,
  TaskDeliveryStatus,
  TaskNotifyPolicy,
  TaskScopeKind,
  TaskTerminalOutcome,
} from "../tasks/task-registry.types.js";

export type PluginTaskRunHandle = {
  taskId: string;
  runId: string;
  sessionKey?: string;
  ownerKey: string;
  runtime: "cli";
};

export function createPluginTaskRun(params: {
  taskKind?: string;
  sourceId?: string;
  requesterSessionKey?: string;
  ownerKey?: string;
  scopeKind?: TaskScopeKind;
  requesterOrigin?: TaskDeliveryState["requesterOrigin"];
  parentFlowId?: string;
  parentTaskId?: string;
  agentId?: string;
  label?: string;
  task: string;
  notifyPolicy?: TaskNotifyPolicy;
  deliveryStatus?: TaskDeliveryStatus;
  startedAt?: number;
  lastEventAt?: number;
  progressSummary?: string | null;
  runId?: string;
}): PluginTaskRunHandle {
  const runId = params.runId?.trim() || `plugin-task:${crypto.randomUUID()}`;
  const record = createRunningTaskRun({
    runtime: "cli",
    taskKind: params.taskKind,
    sourceId: params.sourceId,
    requesterSessionKey: params.requesterSessionKey,
    ownerKey: params.ownerKey,
    scopeKind: params.scopeKind,
    requesterOrigin: params.requesterOrigin,
    parentFlowId: params.parentFlowId,
    parentTaskId: params.parentTaskId,
    agentId: params.agentId,
    runId,
    label: params.label,
    task: params.task,
    notifyPolicy: params.notifyPolicy,
    deliveryStatus: params.deliveryStatus,
    startedAt: params.startedAt,
    lastEventAt: params.lastEventAt,
    progressSummary: params.progressSummary,
  });
  return {
    taskId: record.taskId,
    runId,
    ...(record.requesterSessionKey ? { sessionKey: record.requesterSessionKey } : {}),
    ownerKey: record.ownerKey,
    runtime: "cli",
  };
}

export function recordPluginTaskProgress(params: {
  handle: PluginTaskRunHandle | null;
  progressSummary?: string | null;
  eventSummary?: string | null;
  lastEventAt?: number;
}) {
  if (!params.handle) {
    return;
  }
  recordTaskRunProgressByRunId({
    runId: params.handle.runId,
    runtime: params.handle.runtime,
    sessionKey: params.handle.sessionKey,
    lastEventAt: params.lastEventAt ?? Date.now(),
    progressSummary: params.progressSummary,
    eventSummary: params.eventSummary,
  });
}

export function completePluginTaskRun(params: {
  handle: PluginTaskRunHandle | null;
  endedAt?: number;
  lastEventAt?: number;
  progressSummary?: string | null;
  terminalSummary?: string | null;
  terminalOutcome?: TaskTerminalOutcome | null;
}) {
  if (!params.handle) {
    return;
  }
  const endedAt = params.endedAt ?? Date.now();
  completeTaskRunByRunId({
    runId: params.handle.runId,
    runtime: params.handle.runtime,
    sessionKey: params.handle.sessionKey,
    endedAt,
    lastEventAt: params.lastEventAt ?? endedAt,
    progressSummary: params.progressSummary,
    terminalSummary: params.terminalSummary,
    terminalOutcome: params.terminalOutcome,
  });
}

export function failPluginTaskRun(params: {
  handle: PluginTaskRunHandle | null;
  error?: unknown;
  status?: Extract<
    import("../tasks/task-registry.types.js").TaskStatus,
    "failed" | "timed_out" | "cancelled"
  >;
  endedAt?: number;
  lastEventAt?: number;
  progressSummary?: string | null;
  terminalSummary?: string | null;
}) {
  if (!params.handle) {
    return;
  }
  const endedAt = params.endedAt ?? Date.now();
  failTaskRunByRunId({
    runId: params.handle.runId,
    runtime: params.handle.runtime,
    sessionKey: params.handle.sessionKey,
    status: params.status,
    endedAt,
    lastEventAt: params.lastEventAt ?? endedAt,
    ...(params.error !== undefined ? { error: formatErrorMessage(params.error) } : {}),
    progressSummary: params.progressSummary,
    terminalSummary: params.terminalSummary,
  });
}
