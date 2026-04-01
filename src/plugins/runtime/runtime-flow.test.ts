import { afterEach, describe, expect, it, vi } from "vitest";
import { getFlowById, resetFlowRegistryForTests } from "../../tasks/flow-registry.js";
import { getTaskById, resetTaskRegistryForTests } from "../../tasks/task-registry.js";
import { createRuntimeFlow } from "./runtime-flow.js";

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

vi.mock("../../tasks/task-registry-delivery-runtime.js", () => ({
  sendMessage: hoisted.sendMessageMock,
}));

vi.mock("../../acp/control-plane/manager.js", () => ({
  getAcpSessionManager: () => ({
    cancelSession: hoisted.cancelSessionMock,
  }),
}));

vi.mock("../../agents/subagent-control.js", () => ({
  killSubagentRunAdmin: (params: unknown) => hoisted.killSubagentRunAdminMock(params),
}));

afterEach(() => {
  resetTaskRegistryForTests();
  resetFlowRegistryForTests({ persist: false });
  vi.clearAllMocks();
});

describe("runtime flow", () => {
  it("binds managed flow operations to a session key", () => {
    const runtime = createRuntimeFlow();
    const flow = runtime.bindSession({
      sessionKey: "agent:main:main",
      requesterOrigin: {
        channel: "telegram",
        to: "telegram:123",
      },
    });

    const created = flow.createManaged({
      controllerId: "tests/runtime-flow",
      goal: "Triage inbox",
      currentStep: "classify",
      stateJson: { lane: "inbox" },
    });

    expect(created).toMatchObject({
      syncMode: "managed",
      ownerKey: "agent:main:main",
      controllerId: "tests/runtime-flow",
      requesterOrigin: {
        channel: "telegram",
        to: "telegram:123",
      },
      goal: "Triage inbox",
    });
    expect(flow.get(created.flowId)?.flowId).toBe(created.flowId);
    expect(flow.findLatest()?.flowId).toBe(created.flowId);
    expect(flow.resolve("agent:main:main")?.flowId).toBe(created.flowId);
  });

  it("binds flows from trusted tool context", () => {
    const runtime = createRuntimeFlow();
    const flow = runtime.fromToolContext({
      sessionKey: "agent:main:main",
      deliveryContext: {
        channel: "discord",
        to: "channel:123",
        threadId: "thread:456",
      },
    });

    const created = flow.createManaged({
      controllerId: "tests/runtime-flow",
      goal: "Review queue",
    });

    expect(created.requesterOrigin).toMatchObject({
      channel: "discord",
      to: "channel:123",
      threadId: "thread:456",
    });
  });

  it("rejects tool contexts without a bound session key", () => {
    const runtime = createRuntimeFlow();
    expect(() =>
      runtime.fromToolContext({
        sessionKey: undefined,
        deliveryContext: undefined,
      }),
    ).toThrow("Flow runtime requires tool context with a sessionKey.");
  });

  it("keeps flow reads owner-scoped and runs child tasks under the bound flow", () => {
    const runtime = createRuntimeFlow();
    const ownerFlow = runtime.bindSession({
      sessionKey: "agent:main:main",
    });
    const otherFlow = runtime.bindSession({
      sessionKey: "agent:main:other",
    });

    const created = ownerFlow.createManaged({
      controllerId: "tests/runtime-flow",
      goal: "Inspect PR batch",
    });

    expect(otherFlow.get(created.flowId)).toBeUndefined();
    expect(otherFlow.list()).toEqual([]);

    const child = ownerFlow.runTask({
      flowId: created.flowId,
      runtime: "acp",
      childSessionKey: "agent:main:subagent:child",
      runId: "runtime-flow-child",
      task: "Inspect PR 1",
      status: "running",
      startedAt: 10,
      lastEventAt: 10,
    });

    expect(child).toMatchObject({
      created: true,
      flow: expect.objectContaining({
        flowId: created.flowId,
      }),
      task: expect.objectContaining({
        parentFlowId: created.flowId,
        ownerKey: "agent:main:main",
        runId: "runtime-flow-child",
      }),
    });
    expect(getTaskById(child.task.taskId)).toMatchObject({
      parentFlowId: created.flowId,
      ownerKey: "agent:main:main",
    });
    expect(getFlowById(created.flowId)).toMatchObject({
      flowId: created.flowId,
    });
    expect(ownerFlow.getTaskSummary(created.flowId)).toMatchObject({
      total: 1,
      active: 1,
    });
  });
});
