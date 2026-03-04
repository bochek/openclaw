import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {};
const MAIN_REQUESTER_SESSION_KEY = "agent:main:main";
const MAIN_REQUESTER_DISPLAY_KEY = "main";

type LifecycleData = {
  phase?: string;
  startedAt?: number;
  endedAt?: number;
  aborted?: boolean;
  error?: string;
};
type LifecycleEvent = {
  stream?: string;
  runId: string;
  data?: LifecycleData;
};

let lifecycleHandler: ((evt: LifecycleEvent) => void) | undefined;
const callGatewayMock = vi.fn(async (request: unknown) => {
  const method = (request as { method?: string }).method;
  if (method === "agent.wait") {
    // Keep wait unresolved from the RPC path so lifecycle fallback logic is exercised.
    return { status: "pending" };
  }
  return {};
});
const onAgentEventMock = vi.fn((handler: typeof lifecycleHandler) => {
  lifecycleHandler = handler;
  return noop;
});
const loadConfigMock = vi.fn(() => ({
  agents: { defaults: { subagents: { archiveAfterMinutes: 0 } } },
}));
const loadRegistryMock = vi.fn(() => new Map());
const saveRegistryMock = vi.fn(() => {});
const announceSpy = vi.fn(async () => true);
const captureCompletionReplySpy = vi.fn(async () => undefined as string | undefined);

vi.mock("../gateway/call.js", () => ({
  callGateway: callGatewayMock,
}));

vi.mock("../infra/agent-events.js", () => ({
  onAgentEvent: onAgentEventMock,
}));

vi.mock("../config/config.js", () => ({
  loadConfig: loadConfigMock,
}));

vi.mock("./subagent-announce.js", () => ({
  runSubagentAnnounceFlow: announceSpy,
  captureSubagentCompletionReply: captureCompletionReplySpy,
}));

vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: vi.fn(() => null),
}));

vi.mock("./subagent-registry.store.js", () => ({
  loadSubagentRegistryFromDisk: loadRegistryMock,
  saveSubagentRegistryToDisk: saveRegistryMock,
}));

describe("subagent registry lifecycle error grace", () => {
  let mod: typeof import("./subagent-registry.js");

  beforeAll(async () => {
    mod = await import("./subagent-registry.js");
  });

  beforeEach(() => {
    vi.useFakeTimers();
    announceSpy.mockReset().mockResolvedValue(true);
    captureCompletionReplySpy.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    lifecycleHandler = undefined;
    mod.resetSubagentRegistryForTests({ persist: false });
    vi.useRealTimers();
  });

  const flushAsync = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  function registerCompletionRun(runId: string, childSuffix: string, task: string) {
    mod.registerSubagentRun({
      runId,
      childSessionKey: `agent:main:subagent:${childSuffix}`,
      requesterSessionKey: MAIN_REQUESTER_SESSION_KEY,
      requesterDisplayKey: MAIN_REQUESTER_DISPLAY_KEY,
      task,
      cleanup: "keep",
      expectsCompletionMessage: true,
    });
  }

  function emitLifecycleEvent(runId: string, data: LifecycleData) {
    lifecycleHandler?.({
      stream: "lifecycle",
      runId,
      data,
    });
  }

  function readFirstAnnounceOutcome() {
    const announceCalls = announceSpy.mock.calls as unknown as Array<Array<unknown>>;
    const first = (announceCalls[0]?.[0] ?? {}) as {
      outcome?: { status?: string; error?: string };
    };
    return first.outcome;
  }

  it("ignores transient lifecycle errors when run retries and then ends successfully", async () => {
    registerCompletionRun("run-transient-error", "transient-error", "transient error test");

    emitLifecycleEvent("run-transient-error", {
      phase: "error",
      error: "rate limit",
      endedAt: 1_000,
    });
    await flushAsync();
    expect(announceSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(14_999);
    expect(announceSpy).not.toHaveBeenCalled();

    emitLifecycleEvent("run-transient-error", { phase: "start", startedAt: 1_050 });
    await flushAsync();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(announceSpy).not.toHaveBeenCalled();

    emitLifecycleEvent("run-transient-error", { phase: "end", endedAt: 1_250 });
    await flushAsync();

    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(readFirstAnnounceOutcome()?.status).toBe("ok");
  });

  it("announces error when lifecycle error remains terminal after grace window", async () => {
    registerCompletionRun("run-terminal-error", "terminal-error", "terminal error test");

    emitLifecycleEvent("run-terminal-error", {
      phase: "error",
      error: "fatal failure",
      endedAt: 2_000,
    });
    await flushAsync();
    expect(announceSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15_000);
    await flushAsync();

    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(readFirstAnnounceOutcome()?.status).toBe("error");
    expect(readFirstAnnounceOutcome()?.error).toBe("fatal failure");
  });

  it("freezes completion result at run termination across deferred announce retries", async () => {
    // Regression guard: late lifecycle noise must never overwrite the frozen completion reply.
    registerCompletionRun("run-freeze", "freeze", "freeze test");
    captureCompletionReplySpy.mockResolvedValueOnce("Final answer X");
    announceSpy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const endedAt = Date.now();
    emitLifecycleEvent("run-freeze", { phase: "end", endedAt });
    await flushAsync();

    expect(announceSpy).toHaveBeenCalledTimes(1);
    const firstCall = announceSpy.mock.calls[0]?.[0] as { roundOneReply?: string } | undefined;
    expect(firstCall?.roundOneReply).toBe("Final answer X");

    await vi.waitFor(() => {
      const run = mod
        .listSubagentRunsForRequester(MAIN_REQUESTER_SESSION_KEY)
        .find((candidate) => candidate.runId === "run-freeze");
      expect(run?.cleanupHandled).toBe(false);
    });

    captureCompletionReplySpy.mockResolvedValueOnce("Late reply Y");
    emitLifecycleEvent("run-freeze", { phase: "end", endedAt: endedAt + 100 });
    await flushAsync();

    expect(announceSpy).toHaveBeenCalledTimes(2);
    const secondCall = announceSpy.mock.calls[1]?.[0] as { roundOneReply?: string } | undefined;
    expect(secondCall?.roundOneReply).toBe("Final answer X");
    expect(captureCompletionReplySpy).toHaveBeenCalledTimes(1);
  });

  it("keeps parallel child completion results frozen even when late traffic arrives", async () => {
    // Regression guard: fan-out retries must preserve each child's first frozen result text.
    registerCompletionRun("run-parallel-a", "parallel-a", "parallel a");
    registerCompletionRun("run-parallel-b", "parallel-b", "parallel b");
    captureCompletionReplySpy
      .mockResolvedValueOnce("Final answer A")
      .mockResolvedValueOnce("Final answer B");
    announceSpy
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const parallelEndedAt = Date.now();
    emitLifecycleEvent("run-parallel-a", { phase: "end", endedAt: parallelEndedAt });
    emitLifecycleEvent("run-parallel-b", { phase: "end", endedAt: parallelEndedAt + 1 });
    await flushAsync();

    expect(announceSpy).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      const runs = mod.listSubagentRunsForRequester(MAIN_REQUESTER_SESSION_KEY);
      const runA = runs.find((candidate) => candidate.runId === "run-parallel-a");
      const runB = runs.find((candidate) => candidate.runId === "run-parallel-b");
      expect(runA?.cleanupHandled).toBe(false);
      expect(runB?.cleanupHandled).toBe(false);
    });

    captureCompletionReplySpy.mockResolvedValue("Late overwrite");

    emitLifecycleEvent("run-parallel-a", { phase: "end", endedAt: parallelEndedAt + 100 });
    emitLifecycleEvent("run-parallel-b", { phase: "end", endedAt: parallelEndedAt + 101 });
    await flushAsync();

    expect(announceSpy).toHaveBeenCalledTimes(4);

    const callsByRun = new Map<string, Array<{ roundOneReply?: string }>>();
    for (const call of announceSpy.mock.calls) {
      const params = (call?.[0] ?? {}) as { childRunId?: string; roundOneReply?: string };
      const runId = params.childRunId;
      if (!runId) {
        continue;
      }
      const existing = callsByRun.get(runId) ?? [];
      existing.push({ roundOneReply: params.roundOneReply });
      callsByRun.set(runId, existing);
    }

    expect(callsByRun.get("run-parallel-a")?.map((entry) => entry.roundOneReply)).toEqual([
      "Final answer A",
      "Final answer A",
    ]);
    expect(callsByRun.get("run-parallel-b")?.map((entry) => entry.roundOneReply)).toEqual([
      "Final answer B",
      "Final answer B",
    ]);
    expect(captureCompletionReplySpy).toHaveBeenCalledTimes(2);
  });
});
