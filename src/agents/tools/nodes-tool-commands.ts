import crypto from "node:crypto";
import { parseTimeoutMs } from "../../cli/parse-timeout.js";
import { jsonResult, readStringParam } from "./common.js";
import type { GatewayCallOptions } from "./gateway.js";
import { callGatewayTool } from "./gateway.js";
import { resolveNodeId } from "./nodes-utils.js";

export const BLOCKED_INVOKE_COMMANDS = new Set(["system.run", "system.run.prepare"]);

export const NODE_READ_ACTION_COMMANDS = {
  camera_list: "camera.list",
  notifications_list: "notifications.list",
  device_status: "device.status",
  device_info: "device.info",
  device_permissions: "device.permissions",
  device_health: "device.health",
} as const;

export type NodeCommandAction =
  | keyof typeof NODE_READ_ACTION_COMMANDS
  | "notifications_action"
  | "location_get"
  | "run"
  | "invoke";

function parseEnvList(input: unknown): Record<string, string> | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const entries = input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    return undefined;
  }
  const env: Record<string, string> = {};
  for (const entry of entries) {
    const index = entry.indexOf("=");
    if (index <= 0) {
      continue;
    }
    env[entry.slice(0, index)] = entry.slice(index + 1);
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

export async function executeNodeCommandAction(params: {
  action: NodeCommandAction;
  input: Record<string, unknown>;
  gatewayOpts: GatewayCallOptions;
  allowMediaInvokeCommands?: boolean;
  mediaInvokeActions: Record<string, string>;
}): Promise<
  | ReturnType<typeof jsonResult>
  | { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }
> {
  switch (params.action) {
    case "camera_list":
    case "notifications_list":
    case "device_status":
    case "device_info":
    case "device_permissions":
    case "device_health": {
      const node = readStringParam(params.input, "node", { required: true });
      const payloadRaw = await invokeNodeCommandPayload({
        gatewayOpts: params.gatewayOpts,
        node,
        command: NODE_READ_ACTION_COMMANDS[params.action],
      });
      const payload =
        payloadRaw && typeof payloadRaw === "object" && payloadRaw !== null ? payloadRaw : {};
      return jsonResult(payload);
    }
    case "notifications_action": {
      const node = readStringParam(params.input, "node", { required: true });
      const notificationKey = readStringParam(params.input, "notificationKey", { required: true });
      const notificationAction =
        typeof params.input.notificationAction === "string"
          ? params.input.notificationAction.trim().toLowerCase()
          : "";
      if (
        notificationAction !== "open" &&
        notificationAction !== "dismiss" &&
        notificationAction !== "reply"
      ) {
        throw new Error("notificationAction must be open|dismiss|reply");
      }
      const notificationReplyText =
        typeof params.input.notificationReplyText === "string"
          ? params.input.notificationReplyText.trim()
          : undefined;
      if (notificationAction === "reply" && !notificationReplyText) {
        throw new Error("notificationReplyText required when notificationAction=reply");
      }
      const payloadRaw = await invokeNodeCommandPayload({
        gatewayOpts: params.gatewayOpts,
        node,
        command: "notifications.actions",
        commandParams: {
          key: notificationKey,
          action: notificationAction,
          replyText: notificationReplyText,
        },
      });
      const payload =
        payloadRaw && typeof payloadRaw === "object" && payloadRaw !== null ? payloadRaw : {};
      return jsonResult(payload);
    }
    case "location_get": {
      const node = readStringParam(params.input, "node", { required: true });
      const maxAgeMs =
        typeof params.input.maxAgeMs === "number" && Number.isFinite(params.input.maxAgeMs)
          ? params.input.maxAgeMs
          : undefined;
      const desiredAccuracy =
        params.input.desiredAccuracy === "coarse" ||
        params.input.desiredAccuracy === "balanced" ||
        params.input.desiredAccuracy === "precise"
          ? params.input.desiredAccuracy
          : undefined;
      const locationTimeoutMs =
        typeof params.input.locationTimeoutMs === "number" &&
        Number.isFinite(params.input.locationTimeoutMs)
          ? params.input.locationTimeoutMs
          : undefined;
      const payload = await invokeNodeCommandPayload({
        gatewayOpts: params.gatewayOpts,
        node,
        command: "location.get",
        commandParams: {
          maxAgeMs,
          desiredAccuracy,
          timeoutMs: locationTimeoutMs,
        },
      });
      return jsonResult(payload);
    }
    case "run": {
      const node = readStringParam(params.input, "node", { required: true });
      const nodeId = await resolveNodeId(params.gatewayOpts, node);
      const command = Array.isArray(params.input.command)
        ? params.input.command.filter((value): value is string => typeof value === "string")
        : [];
      if (command.length === 0) {
        throw new Error("command must be a non-empty string array");
      }
      const cwd =
        typeof params.input.cwd === "string" && params.input.cwd.trim()
          ? params.input.cwd.trim()
          : undefined;
      const agentId =
        typeof params.input.agentId === "string" && params.input.agentId.trim()
          ? params.input.agentId.trim()
          : undefined;
      const env = parseEnvList(params.input.env);
      const commandTimeoutMs = parseTimeoutMs(params.input.commandTimeoutMs);
      const invokeTimeoutMs = parseTimeoutMs(params.input.invokeTimeoutMs);
      const prepareRaw = await callGatewayTool<{ payload?: { plan?: Record<string, unknown> } }>(
        "node.invoke",
        params.gatewayOpts,
        {
          nodeId,
          command: "system.run.prepare",
          params: {
            command,
            rawCommand: command.join(" "),
            cwd,
            agentId,
          },
          idempotencyKey: crypto.randomUUID(),
        },
      );
      const prepared = prepareRaw?.payload?.plan;
      if (!prepared || typeof prepared !== "object") {
        throw new Error("invalid system.run.prepare response");
      }
      const preparedArgv = Array.isArray(prepared.argv)
        ? prepared.argv.filter((value): value is string => typeof value === "string")
        : command;
      const preparedCommandText =
        typeof prepared.commandText === "string" && prepared.commandText.trim()
          ? prepared.commandText.trim()
          : command.join(" ");
      const preparedCwd =
        typeof prepared.cwd === "string" && prepared.cwd.trim() ? prepared.cwd.trim() : cwd;
      const preparedAgentId =
        typeof prepared.agentId === "string" && prepared.agentId.trim()
          ? prepared.agentId.trim()
          : agentId;
      const invokeRun = async (approvalDecision?: "allow-once" | "allow-always") =>
        await callGatewayTool(
          "node.invoke",
          { ...params.gatewayOpts, timeoutMs: invokeTimeoutMs },
          {
            nodeId,
            command: "system.run",
            params: {
              command: preparedArgv,
              rawCommand: preparedCommandText,
              cwd: preparedCwd,
              env,
              timeoutMs: commandTimeoutMs,
              agentId: preparedAgentId,
              approved: approvalDecision ? true : undefined,
              approvalDecision,
              runId: approvalDecision ? crypto.randomUUID() : undefined,
            },
            idempotencyKey: crypto.randomUUID(),
          },
        );

      try {
        return jsonResult((await invokeRun()) ?? {});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("SYSTEM_RUN_DENIED: approval required")) {
          throw err;
        }
        const approvalId = crypto.randomUUID();
        const approval = await callGatewayTool<{ decision?: unknown }>(
          "exec.approval.request",
          params.gatewayOpts,
          {
            id: approvalId,
            systemRunPlan: prepared,
            nodeId,
            host: "node",
            timeoutMs: 120_000,
          },
        );
        const decision =
          typeof approval?.decision === "string" ? approval.decision.trim().toLowerCase() : "";
        if (!decision) {
          throw new Error("exec denied: approval timed out");
        }
        if (decision === "deny") {
          throw new Error("exec denied: user denied");
        }
        if (decision !== "allow-once" && decision !== "allow-always") {
          throw new Error("exec denied: invalid approval decision");
        }
        return jsonResult((await invokeRun(decision)) ?? {});
      }
    }
    case "invoke": {
      const node = readStringParam(params.input, "node", { required: true });
      const nodeId = await resolveNodeId(params.gatewayOpts, node);
      const invokeCommand = readStringParam(params.input, "invokeCommand", { required: true });
      const invokeCommandNormalized = invokeCommand.trim().toLowerCase();
      if (BLOCKED_INVOKE_COMMANDS.has(invokeCommandNormalized)) {
        throw new Error(
          `invokeCommand "${invokeCommand}" is reserved for shell execution; use exec with host=node instead`,
        );
      }
      const dedicatedAction = params.mediaInvokeActions[invokeCommandNormalized];
      if (dedicatedAction && !params.allowMediaInvokeCommands) {
        throw new Error(
          `invokeCommand "${invokeCommand}" returns media payloads and is blocked to prevent base64 context bloat; use action="${dedicatedAction}"`,
        );
      }
      const invokeParamsJson =
        typeof params.input.invokeParamsJson === "string"
          ? params.input.invokeParamsJson.trim()
          : "";
      let invokeParams: unknown = {};
      if (invokeParamsJson) {
        try {
          invokeParams = JSON.parse(invokeParamsJson);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`invokeParamsJson must be valid JSON: ${message}`, {
            cause: err,
          });
        }
      }
      const invokeTimeoutMs = parseTimeoutMs(params.input.invokeTimeoutMs);
      const raw = await callGatewayTool("node.invoke", params.gatewayOpts, {
        nodeId,
        command: invokeCommand,
        params: invokeParams,
        timeoutMs: invokeTimeoutMs,
        idempotencyKey: crypto.randomUUID(),
      });
      return jsonResult(raw ?? {});
    }
  }
}

export async function invokeNodeCommandPayload(params: {
  gatewayOpts: GatewayCallOptions;
  node: string;
  command: string;
  commandParams?: Record<string, unknown>;
}): Promise<unknown> {
  const nodeId = await resolveNodeId(params.gatewayOpts, params.node);
  const raw = await callGatewayTool<{ payload: unknown }>("node.invoke", params.gatewayOpts, {
    nodeId,
    command: params.command,
    params: params.commandParams ?? {},
    idempotencyKey: crypto.randomUUID(),
  });
  return raw?.payload ?? {};
}
