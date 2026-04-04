import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntimeTaskFlow } from "../../../src/plugins/runtime/runtime-taskflow.js";
import { createMockServerResponse } from "../../../src/test-utils/mock-http-response.js";
import type { OpenClawConfig } from "../runtime-api.js";
import { createTaskFlowWebhookRequestHandler, type TaskFlowWebhookTarget } from "./http.js";

const hoisted = vi.hoisted(() => {
  const sendMessageMock = vi.fn();
  const cancelSessionMock = vi.fn();
  const killSubagentRunAdminMock = vi.fn();
  return {
    sendMessageMock,
    cancelSessionMock,
    killSubagentRunAdminMock,
  };
});

vi.mock("../../../src/tasks/task-registry-delivery-runtime.js", () => ({
  sendMessage: hoisted.sendMessageMock,
}));

vi.mock("../../../src/acp/control-plane/manager.js", () => ({
  getAcpSessionManager: () => ({
    cancelSession: hoisted.cancelSessionMock,
  }),
}));

vi.mock("../../../src/agents/subagent-control.js", () => ({
  killSubagentRunAdmin: (params: unknown) => hoisted.killSubagentRunAdminMock(params),
}));

type MockIncomingMessage = IncomingMessage & {
  destroyed?: boolean;
  destroy: () => MockIncomingMessage;
  socket: { remoteAddress: string };
};

let nextSessionId = 0;

function createJsonRequest(params: {
  path: string;
  secret?: string;
  body: unknown;
}): MockIncomingMessage {
  const req = new EventEmitter() as MockIncomingMessage;
  req.method = "POST";
  req.url = params.path;
  req.headers = {
    "content-type": "application/json",
    ...(params.secret ? { "x-openclaw-webhook-secret": params.secret } : {}),
  };
  req.socket = { remoteAddress: "127.0.0.1" } as MockIncomingMessage["socket"];
  req.destroyed = false;
  req.destroy = (() => {
    req.destroyed = true;
    return req;
  }) as MockIncomingMessage["destroy"];

  void Promise.resolve().then(() => {
    req.emit("data", Buffer.from(JSON.stringify(params.body), "utf8"));
    req.emit("end");
  });

  return req;
}

function createHandler(): {
  handler: ReturnType<typeof createTaskFlowWebhookRequestHandler>;
  target: TaskFlowWebhookTarget;
} {
  const runtime = createRuntimeTaskFlow();
  nextSessionId += 1;
  const target: TaskFlowWebhookTarget = {
    routeId: "zapier",
    path: "/plugins/webhooks/zapier",
    secret: "shared-secret",
    defaultControllerId: "webhooks/zapier",
    taskFlow: runtime.bindSession({
      sessionKey: `agent:main:webhook-test-${String(nextSessionId)}`,
    }),
  };
  const targetsByPath = new Map<string, TaskFlowWebhookTarget[]>([[target.path, [target]]]);
  return {
    handler: createTaskFlowWebhookRequestHandler({
      cfg: {} as OpenClawConfig,
      targetsByPath,
    }),
    target,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("createTaskFlowWebhookRequestHandler", () => {
  it("rejects requests with the wrong secret", async () => {
    const { handler, target } = createHandler();
    const req = createJsonRequest({
      path: target.path,
      secret: "wrong-secret",
      body: {
        action: "list_flows",
      },
    });
    const res = createMockServerResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toBe("unauthorized");
    expect(target.taskFlow.list()).toEqual([]);
  });

  it("creates flows through the bound session and scrubs owner metadata from responses", async () => {
    const { handler, target } = createHandler();
    const req = createJsonRequest({
      path: target.path,
      secret: target.secret,
      body: {
        action: "create_flow",
        goal: "Review inbound queue",
      },
    });
    const res = createMockServerResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body ?? "");
    expect(parsed.ok).toBe(true);
    expect(parsed.result.flow).toMatchObject({
      syncMode: "managed",
      controllerId: "webhooks/zapier",
      goal: "Review inbound queue",
    });
    expect(parsed.result.flow.ownerKey).toBeUndefined();
    expect(parsed.result.flow.requesterOrigin).toBeUndefined();
    expect(target.taskFlow.get(parsed.result.flow.flowId)?.flowId).toBe(parsed.result.flow.flowId);
  });

  it("runs child tasks and scrubs task ownership fields from responses", async () => {
    const { handler, target } = createHandler();
    const flow = target.taskFlow.createManaged({
      controllerId: "webhooks/zapier",
      goal: "Triage inbox",
    });
    const req = createJsonRequest({
      path: target.path,
      secret: target.secret,
      body: {
        action: "run_task",
        flowId: flow.flowId,
        runtime: "acp",
        childSessionKey: "agent:main:subagent:child",
        task: "Inspect the next message batch",
        status: "running",
        startedAt: 10,
        lastEventAt: 10,
      },
    });
    const res = createMockServerResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body ?? "");
    expect(parsed.ok).toBe(true);
    expect(parsed.result.created).toBe(true);
    expect(parsed.result.task).toMatchObject({
      parentFlowId: flow.flowId,
      childSessionKey: "agent:main:subagent:child",
      runtime: "acp",
    });
    expect(parsed.result.task.ownerKey).toBeUndefined();
    expect(parsed.result.task.requesterSessionKey).toBeUndefined();
  });
});
