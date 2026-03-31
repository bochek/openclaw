import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { __testing as supervisorTesting } from "../process/supervisor/index.js";
import { resetProcessRegistryForTests } from "./bash-process-registry.js";
import { createExecTool } from "./bash-tools.exec.js";

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

beforeEach(() => {
  supervisorTesting.setProcessSupervisorForTest(makeSupervisor());
});

afterEach(() => {
  supervisorTesting.setProcessSupervisorForTest();
  resetProcessRegistryForTests();
  vi.clearAllMocks();
});

test("exec falls back when PTY spawn fails", async () => {
  supervisorSpawnMock
    .mockRejectedValueOnce(new Error("spawn EBADF"))
    .mockImplementationOnce(async (input: {
      mode: string;
      onStdout?: (chunk: string) => void;
    }) => {
      expect(input.mode).toBe("child");
      return {
        pid: 123,
        stdin: undefined,
        wait: async () => {
          input.onStdout?.("ok");
          return {
            reason: "exit",
            exitCode: 0,
            exitSignal: null,
            durationMs: 1,
            stdout: "ok",
            stderr: "",
            timedOut: false,
            noOutputTimedOut: false,
          };
        },
        cancel: () => {},
      };
    });

  const tool = createExecTool({
    allowBackground: false,
    host: "gateway",
    security: "full",
    ask: "off",
  });
  const result = await tool.execute("toolcall", {
    command: "printf ok",
    pty: true,
  });

  expect(result.details.status).toBe("completed");
  expect(supervisorSpawnMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      mode: "pty",
      ptyCommand: "printf ok",
    }),
  );
  expect(supervisorSpawnMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      mode: "child",
      argv: expect.any(Array),
    }),
  );
  const text = result.content?.find((item) => item.type === "text")?.text ?? "";
  expect(text).toContain("ok");
  expect(text).toContain("PTY spawn failed");
});
