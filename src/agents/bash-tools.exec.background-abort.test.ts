import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { __testing as supervisorTesting } from "../process/supervisor/index.js";
import {
  getFinishedSession,
  getSession,
  resetProcessRegistryForTests,
} from "./bash-process-registry.js";
import { createExecTool } from "./bash-tools.exec.js";

const ABORT_SETTLE_MS = process.platform === "win32" ? 200 : 25;
const ABORT_WAIT_TIMEOUT_MS = process.platform === "win32" ? 1_500 : 240;
const POLL_INTERVAL_MS = 15;
const FINISHED_WAIT_TIMEOUT_MS = process.platform === "win32" ? 8_000 : 600;
const BACKGROUND_TIMEOUT_SEC = process.platform === "win32" ? 0.2 : 0.05;
const TEST_EXEC_DEFAULTS = {
  host: "gateway" as const,
  security: "full" as const,
  ask: "off" as const,
};

const { supervisorSpawnMock, makeSupervisor } = vi.hoisted(() => {
  const supervisorSpawnMock = vi.fn();
  const makeSupervisor = () => {
    const noop = vi.fn();
    return {
      spawn: (...args: unknown[]) => supervisorSpawnMock(...args),
      cancel: noop,
      cancelScope: noop,
      reconcileOrphans: noop,
      getRecord: noop,
    };
  };
  return { supervisorSpawnMock, makeSupervisor };
});

const createTestExecTool = (
  defaults?: Parameters<typeof createExecTool>[0],
): ReturnType<typeof createExecTool> => createExecTool({ ...TEST_EXEC_DEFAULTS, ...defaults });

function createPendingManagedRun() {
  const cancel = vi.fn();
  let settle:
    | (() => void)
    | undefined;
  const waitPromise = new Promise<{
    reason: "exit";
    exitCode: number;
    exitSignal: NodeJS.Signals | number | null;
    durationMs: number;
    stdout: string;
    stderr: string;
    timedOut: false;
    noOutputTimedOut: false;
  }>((resolve) => {
    settle = () =>
      resolve({
        reason: "exit",
        exitCode: 0,
        exitSignal: null,
        durationMs: 10,
        stdout: "",
        stderr: "",
        timedOut: false,
        noOutputTimedOut: false,
      });
  });
  return {
    pid: 123,
    stdin: undefined,
    wait: async () => await waitPromise,
    cancel,
    settle: () => settle?.(),
  };
}

function createResolvedManagedRun(exit: {
  reason: "overall-timeout" | "exit";
  exitCode: number | null;
  exitSignal: NodeJS.Signals | number | null;
  timedOut: boolean;
}) {
  const cancel = vi.fn();
  return {
    pid: 123,
    stdin: undefined,
    wait: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        ...exit,
        durationMs: 10,
        stdout: "",
        stderr: "",
        noOutputTimedOut: false,
      };
    },
    cancel,
  };
}

beforeEach(() => {
  supervisorTesting.setProcessSupervisorForTest(makeSupervisor());
});

afterEach(() => {
  supervisorTesting.setProcessSupervisorForTest();
  resetProcessRegistryForTests();
  vi.clearAllMocks();
});

async function waitUntil(params: {
  check: () => boolean;
  timeoutMs: number;
  intervalMs: number;
  message: string;
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < params.timeoutMs) {
    if (params.check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, params.intervalMs));
  }
  throw new Error(params.message);
}

async function waitForFinishedSession(sessionId: string) {
  let finished = getFinishedSession(sessionId);
  await waitUntil({
    check: () => {
      finished = getFinishedSession(sessionId);
      return Boolean(finished);
    },
    timeoutMs: FINISHED_WAIT_TIMEOUT_MS,
    intervalMs: POLL_INTERVAL_MS,
    message: `Timed out waiting for finished session ${sessionId}`,
  });
  return finished;
}

async function expectBackgroundSessionSurvivesAbort(params: {
  tool: ReturnType<typeof createExecTool>;
  executeParams: Record<string, unknown>;
}) {
  const run = createPendingManagedRun();
  supervisorSpawnMock.mockResolvedValueOnce(run);

  const abortController = new AbortController();
  const result = await params.tool.execute(
    "toolcall",
    params.executeParams,
    abortController.signal,
  );
  expect(result.details.status).toBe("running");
  const sessionId = (result.details as { sessionId: string }).sessionId;

  abortController.abort();
  const startedAt = Date.now();
  await waitUntil({
    check: () => {
      const running = getSession(sessionId);
      const finished = getFinishedSession(sessionId);
      return Date.now() - startedAt >= ABORT_SETTLE_MS && !finished && running?.exited === false;
    },
    timeoutMs: ABORT_WAIT_TIMEOUT_MS,
    intervalMs: POLL_INTERVAL_MS,
    message: `Timed out waiting for background session ${sessionId} to survive abort`,
  });

  const running = getSession(sessionId);
  const finished = getFinishedSession(sessionId);
  expect(finished).toBeUndefined();
  expect(running?.exited).toBe(false);
  expect(run.cancel).not.toHaveBeenCalled();
  run.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function expectBackgroundSessionTimesOut(params: {
  tool: ReturnType<typeof createExecTool>;
  executeParams: Record<string, unknown>;
  abortAfterStart?: boolean;
}) {
  const run = createResolvedManagedRun({
    reason: "overall-timeout",
    exitCode: 137,
    exitSignal: null,
    timedOut: true,
  });
  supervisorSpawnMock.mockResolvedValueOnce(run);

  const abortController = new AbortController();
  const result = await params.tool.execute(
    "toolcall",
    params.executeParams,
    abortController.signal,
  );
  expect(result.details.status).toBe("running");
  const sessionId = (result.details as { sessionId: string }).sessionId;

  if (params.abortAfterStart) {
    abortController.abort();
  }

  const finished = await waitForFinishedSession(sessionId);
  expect(finished).toBeTruthy();
  expect(finished?.status).toBe("failed");
  expect(run.cancel).not.toHaveBeenCalled();
}

test("background exec is not killed when tool signal aborts", async () => {
  const tool = createTestExecTool({ allowBackground: true, backgroundMs: 0 });
  await expectBackgroundSessionSurvivesAbort({
    tool,
    executeParams: { command: 'node -e "setTimeout(() => {}, 5000)"', background: true },
  });
});

test("pty background exec is not killed when tool signal aborts", async () => {
  const tool = createTestExecTool({ allowBackground: true, backgroundMs: 0 });
  await expectBackgroundSessionSurvivesAbort({
    tool,
    executeParams: { command: 'node -e "setTimeout(() => {}, 5000)"', background: true, pty: true },
  });
  expect(supervisorSpawnMock).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "pty",
    }),
  );
});

test("background exec still times out after tool signal abort", async () => {
  const tool = createTestExecTool({ allowBackground: true, backgroundMs: 0 });
  await expectBackgroundSessionTimesOut({
    tool,
    executeParams: {
      command: 'node -e "setTimeout(() => {}, 5000)"',
      background: true,
      timeout: BACKGROUND_TIMEOUT_SEC,
    },
    abortAfterStart: true,
  });
});

test("background exec without explicit timeout ignores default timeout", async () => {
  const tool = createTestExecTool({
    allowBackground: true,
    backgroundMs: 0,
    timeoutSec: BACKGROUND_TIMEOUT_SEC,
  });
  const run = createPendingManagedRun();
  supervisorSpawnMock.mockResolvedValueOnce(run);

  const result = await tool.execute("toolcall", {
    command: 'node -e "setTimeout(() => {}, 5000)"',
    background: true,
  });
  expect(result.details.status).toBe("running");
  const sessionId = (result.details as { sessionId: string }).sessionId;

  const startedAt = Date.now();
  const waitMs = Math.max(ABORT_SETTLE_MS + 80, BACKGROUND_TIMEOUT_SEC * 1000 + 80);
  await waitUntil({
    check: () => {
      const running = getSession(sessionId);
      const finished = getFinishedSession(sessionId);
      return Date.now() - startedAt >= waitMs && !finished && running?.exited === false;
    },
    timeoutMs: waitMs + ABORT_WAIT_TIMEOUT_MS,
    intervalMs: POLL_INTERVAL_MS,
    message: `Timed out waiting for background session ${sessionId} to ignore default timeout`,
  });

  expect(supervisorSpawnMock).toHaveBeenCalledWith(
    expect.objectContaining({
      timeoutMs: undefined,
    }),
  );
  expect(run.cancel).not.toHaveBeenCalled();
  run.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("yielded background exec still times out", async () => {
  const tool = createTestExecTool({ allowBackground: true, backgroundMs: 10 });
  await expectBackgroundSessionTimesOut({
    tool,
    executeParams: {
      command: 'node -e "setTimeout(() => {}, 5000)"',
      yieldMs: 5,
      timeout: BACKGROUND_TIMEOUT_SEC,
    },
  });
});
