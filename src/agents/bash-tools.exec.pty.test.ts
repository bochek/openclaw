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

function mockCompletedPtyRun(stdout: string) {
  supervisorSpawnMock.mockImplementationOnce(async (input: {
    mode: string;
    onStdout?: (chunk: string) => void;
  }) => ({
    pid: 123,
    stdin: undefined,
    wait: async () => {
      input.onStdout?.(stdout);
      return {
        reason: "exit",
        exitCode: 0,
        exitSignal: null,
        durationMs: 1,
        stdout,
        stderr: "",
        timedOut: false,
        noOutputTimedOut: false,
      };
    },
    cancel: () => {},
  }));
}

test("exec supports pty output", async () => {
  mockCompletedPtyRun("ok");
  const tool = createExecTool({
    allowBackground: false,
    host: "gateway",
    security: "full",
    ask: "off",
  });
  const result = await tool.execute("toolcall", {
    command: 'node -e "process.stdout.write(String.fromCharCode(111,107))"',
    pty: true,
  });

  expect(result.details.status).toBe("completed");
  expect(supervisorSpawnMock).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "pty",
      ptyCommand: 'node -e "process.stdout.write(String.fromCharCode(111,107))"',
    }),
  );
  const text = result.content?.find((item) => item.type === "text")?.text ?? "";
  expect(text).toContain("ok");
});

test("exec sets OPENCLAW_SHELL in pty mode", async () => {
  mockCompletedPtyRun("exec");
  const tool = createExecTool({
    allowBackground: false,
    host: "gateway",
    security: "full",
    ask: "off",
  });
  const result = await tool.execute("toolcall-openclaw-shell", {
    command: "node -e \"process.stdout.write(process.env.OPENCLAW_SHELL || '')\"",
    pty: true,
  });

  expect(result.details.status).toBe("completed");
  expect(supervisorSpawnMock).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "pty",
      env: expect.objectContaining({
        OPENCLAW_SHELL: "exec",
      }),
    }),
  );
  const text = result.content?.find((item) => item.type === "text")?.text ?? "";
  expect(text).toContain("exec");
});
