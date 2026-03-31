import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { __testing as supervisorTesting } from "../process/supervisor/index.js";
import { resetProcessRegistryForTests } from "./bash-process-registry.js";
import { createExecTool } from "./bash-tools.exec.js";

const { spawnMock, makeSupervisor } = vi.hoisted(() => {
  const spawnMock = vi.fn();
  const makeSupervisor = () => {
    const noop = vi.fn();
    return {
      spawn: (...args: unknown[]) => spawnMock(...args),
      cancel: noop,
      cancelScope: noop,
      reconcileOrphans: noop,
      getRecord: noop,
    };
  };
  return { spawnMock, makeSupervisor };
});

beforeEach(() => {
  supervisorTesting.setProcessSupervisorForTest(makeSupervisor());
});

afterEach(() => {
  supervisorTesting.setProcessSupervisorForTest();
  resetProcessRegistryForTests();
  vi.clearAllMocks();
});

test("exec disposes PTY stdin after normal exit", async () => {
  const stdinDestroy = vi.fn();

  spawnMock.mockResolvedValue({
    pid: 123,
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
      destroy: stdinDestroy,
      destroyed: false,
    },
    wait: async () => ({
      reason: "exit",
      exitCode: 0,
      exitSignal: null,
      durationMs: 1,
      stdout: "",
      stderr: "",
      timedOut: false,
      noOutputTimedOut: false,
    }),
  });

  const tool = createExecTool({
    allowBackground: false,
    host: "gateway",
    security: "full",
    ask: "off",
  });
  const result = await tool.execute("toolcall", {
    command: "echo ok",
    pty: true,
  });

  expect(result.details.status).toBe("completed");
  expect(spawnMock).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "pty",
      ptyCommand: "echo ok",
    }),
  );
  expect(stdinDestroy).toHaveBeenCalledTimes(1);
});

test("exec disposes PTY stdin after timeout failure", async () => {
  const stdinDestroy = vi.fn();

  spawnMock.mockResolvedValue({
    pid: 456,
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
      destroy: stdinDestroy,
      destroyed: false,
    },
    wait: async () => ({
      reason: "overall-timeout",
      exitCode: 137,
      exitSignal: null,
      durationMs: 10,
      stdout: "",
      stderr: "",
      timedOut: true,
      noOutputTimedOut: false,
    }),
  });

  const tool = createExecTool({
    allowBackground: false,
    host: "gateway",
    security: "full",
    ask: "off",
  });
  const result = await tool.execute("toolcall", {
    command: "sleep 5",
    pty: true,
    timeout: 0.01,
  });

  expect(result.details.status).toBe("failed");
  expect(result.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("Command timed out"),
      }),
    ]),
  );
  expect(spawnMock).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "pty",
      ptyCommand: "sleep 5",
      timeoutMs: 10,
    }),
  );
  expect(stdinDestroy).toHaveBeenCalledTimes(1);
});
