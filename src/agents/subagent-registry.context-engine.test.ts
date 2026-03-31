import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __testing as subagentRegistryTesting,
  addSubagentRunForTests,
  releaseSubagentRun,
  resetSubagentRegistryForTests,
} from "./subagent-registry.js";

const noop = () => {};

const mocks = {
  loadConfig: vi.fn(() => ({})),
  ensureRuntimePluginsLoaded: vi.fn(),
  ensureContextEnginesInitialized: vi.fn(),
  resolveContextEngine: vi.fn(),
  onSubagentEnded: vi.fn(async () => {}),
  onAgentEvent: vi.fn(() => noop),
  persistSubagentRunsToDisk: vi.fn(),
  restoreSubagentRunsFromDisk: vi.fn(() => 0),
  getSubagentRunsSnapshotForRead: vi.fn((runs: Map<string, unknown>) => new Map(runs)),
  resolveAgentTimeoutMs: vi.fn(() => 1_000),
};

describe("subagent-registry context-engine bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveContextEngine.mockResolvedValue({
      onSubagentEnded: mocks.onSubagentEnded,
    });
    subagentRegistryTesting.setDepsForTest({
      loadConfig: mocks.loadConfig,
      ensureRuntimePluginsLoaded: mocks.ensureRuntimePluginsLoaded,
      ensureContextEnginesInitialized: mocks.ensureContextEnginesInitialized,
      resolveContextEngine: mocks.resolveContextEngine,
      onAgentEvent: mocks.onAgentEvent,
      persistSubagentRunsToDisk: mocks.persistSubagentRunsToDisk,
      restoreSubagentRunsFromDisk: mocks.restoreSubagentRunsFromDisk,
      getSubagentRunsSnapshotForRead: mocks.getSubagentRunsSnapshotForRead,
      resolveAgentTimeoutMs: mocks.resolveAgentTimeoutMs,
    });
    resetSubagentRegistryForTests({ persist: false });
  });

  afterEach(() => {
    subagentRegistryTesting.setDepsForTest();
  });

  it("reloads runtime plugins with the spawned workspace before released subagent end hooks", async () => {
    addSubagentRunForTests({
      runId: "run-1",
      childSessionKey: "agent:main:session:child",
      controllerSessionKey: "agent:main:session:parent",
      requesterSessionKey: "agent:main:session:parent",
      requesterOrigin: undefined,
      requesterDisplayKey: "parent",
      task: "task",
      cleanup: "keep",
      expectsCompletionMessage: undefined,
      spawnMode: "run",
      workspaceDir: "/tmp/workspace",
      createdAt: 1,
      startedAt: 1,
      sessionStartedAt: 1,
      accumulatedRuntimeMs: 0,
      cleanupHandled: false,
    });

    releaseSubagentRun("run-1");

    await vi.waitFor(() => {
      expect(mocks.ensureRuntimePluginsLoaded).toHaveBeenCalledWith({
        config: {},
        workspaceDir: "/tmp/workspace",
        allowGatewaySubagentBinding: true,
      });
    });
    expect(mocks.ensureContextEnginesInitialized).toHaveBeenCalledTimes(1);
    expect(mocks.onSubagentEnded).toHaveBeenCalledWith({
      childSessionKey: "agent:main:session:child",
      reason: "released",
      workspaceDir: "/tmp/workspace",
    });
  });
});
