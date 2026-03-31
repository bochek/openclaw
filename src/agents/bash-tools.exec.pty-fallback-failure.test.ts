import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { __testing as supervisorTesting } from "../process/supervisor/index.js";
import { listRunningSessions, resetProcessRegistryForTests } from "./bash-process-registry.js";
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
  return {
    supervisorSpawnMock,
    makeSupervisor,
  };
});

beforeEach(() => {
  supervisorTesting.setProcessSupervisorForTest(makeSupervisor());
});

afterEach(() => {
  supervisorTesting.setProcessSupervisorForTest();
  resetProcessRegistryForTests();
  vi.clearAllMocks();
});

test("exec cleans session state when PTY fallback spawn also fails", async () => {
  const baselineCount = listRunningSessions().length;
  supervisorSpawnMock
    .mockRejectedValueOnce(new Error("pty spawn failed"))
    .mockRejectedValueOnce(new Error("child fallback failed"));

  const tool = createExecTool({
    allowBackground: false,
    host: "gateway",
    security: "full",
    ask: "off",
  });

  await expect(
    tool.execute("toolcall", {
      command: "echo ok",
      pty: true,
    }),
  ).rejects.toThrow("child fallback failed");

  expect(listRunningSessions()).toHaveLength(baselineCount);
});
