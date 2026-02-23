import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import type { RuntimeEnv } from "../runtime.js";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  resolveDefaultAgentId: vi.fn(),
  resolveStorePath: vi.fn(),
  resolveMaintenanceConfig: vi.fn(),
  loadSessionStore: vi.fn(),
  pruneStaleEntries: vi.fn(),
  capEntryCount: vi.fn(),
  updateSessionStore: vi.fn(),
  enforceSessionDiskBudget: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: mocks.resolveDefaultAgentId,
}));

vi.mock("../config/sessions.js", () => ({
  resolveStorePath: mocks.resolveStorePath,
  resolveMaintenanceConfig: mocks.resolveMaintenanceConfig,
  loadSessionStore: mocks.loadSessionStore,
  pruneStaleEntries: mocks.pruneStaleEntries,
  capEntryCount: mocks.capEntryCount,
  updateSessionStore: mocks.updateSessionStore,
  enforceSessionDiskBudget: mocks.enforceSessionDiskBudget,
}));

import { sessionsCleanupCommand } from "./sessions-cleanup.js";

function makeRuntime(): { runtime: RuntimeEnv; logs: string[] } {
  const logs: string[] = [];
  return {
    runtime: {
      log: (msg: unknown) => logs.push(String(msg)),
      error: () => {},
      exit: () => {},
    },
    logs,
  };
}

describe("sessionsCleanupCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue({ session: { store: "/cfg/sessions.json" } });
    mocks.resolveDefaultAgentId.mockReturnValue("main");
    mocks.resolveStorePath.mockReturnValue("/resolved/sessions.json");
    mocks.resolveMaintenanceConfig.mockReturnValue({
      mode: "warn",
      pruneAfterMs: 7 * 24 * 60 * 60 * 1000,
      maxEntries: 500,
      rotateBytes: 10_485_760,
      resetArchiveRetentionMs: 7 * 24 * 60 * 60 * 1000,
      maxDiskBytes: null,
      highWaterBytes: null,
    });
    mocks.pruneStaleEntries.mockImplementation((store: Record<string, SessionEntry>) => {
      if (store.stale) {
        delete store.stale;
        return 1;
      }
      return 0;
    });
    mocks.capEntryCount.mockImplementation(() => 0);
    mocks.updateSessionStore.mockResolvedValue(undefined);
    mocks.enforceSessionDiskBudget.mockResolvedValue({
      totalBytesBefore: 1000,
      totalBytesAfter: 700,
      removedFiles: 1,
      removedEntries: 1,
      freedBytes: 300,
      maxBytes: 900,
      highWaterBytes: 700,
      overBudget: true,
    });
  });

  it("emits a single JSON object for non-dry runs and applies maintenance", async () => {
    mocks.loadSessionStore
      .mockReturnValueOnce({
        stale: { sessionId: "stale", updatedAt: 1 },
        fresh: { sessionId: "fresh", updatedAt: 2 },
      })
      .mockReturnValueOnce({
        fresh: { sessionId: "fresh", updatedAt: 2 },
      });

    const { runtime, logs } = makeRuntime();
    await sessionsCleanupCommand(
      {
        json: true,
        enforce: true,
        activeKey: "agent:main:main",
      },
      runtime,
    );

    expect(logs).toHaveLength(1);
    const payload = JSON.parse(logs[0] ?? "{}") as Record<string, unknown>;
    expect(payload.applied).toBe(true);
    expect(payload.mode).toBe("enforce");
    expect(payload.beforeCount).toBe(2);
    expect(payload.appliedCount).toBe(1);
    expect(payload.diskBudget).toEqual(
      expect.objectContaining({
        removedFiles: 1,
        removedEntries: 1,
      }),
    );
    expect(mocks.updateSessionStore).toHaveBeenCalledWith(
      "/resolved/sessions.json",
      expect.any(Function),
      expect.objectContaining({
        activeSessionKey: "agent:main:main",
        maintenanceOverride: { mode: "enforce" },
      }),
    );
  });

  it("returns dry-run JSON without mutating the store", async () => {
    mocks.loadSessionStore.mockReturnValue({
      stale: { sessionId: "stale", updatedAt: 1 },
      fresh: { sessionId: "fresh", updatedAt: 2 },
    });

    const { runtime, logs } = makeRuntime();
    await sessionsCleanupCommand(
      {
        json: true,
        dryRun: true,
      },
      runtime,
    );

    expect(logs).toHaveLength(1);
    const payload = JSON.parse(logs[0] ?? "{}") as Record<string, unknown>;
    expect(payload.dryRun).toBe(true);
    expect(payload.applied).toBeUndefined();
    expect(mocks.updateSessionStore).not.toHaveBeenCalled();
    expect(payload.diskBudget).toEqual(
      expect.objectContaining({
        removedFiles: 1,
        removedEntries: 1,
      }),
    );
  });
});
