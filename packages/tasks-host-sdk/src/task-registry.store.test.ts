import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireNodeSqlite } from "../../../src/infra/node-sqlite.js";
import {
  createTaskRecord,
  deleteTaskRecordById,
  findTaskByRunId,
  resetTaskRegistryForTests,
} from "./task-registry.js";
import { resolveTaskRegistryDir, resolveTaskRegistrySqlitePath } from "./task-registry.paths.js";
import { configureTaskRegistryRuntime, type TaskRegistryHookEvent } from "./task-registry.store.js";
import { loadTaskRegistryStateFromSqlite } from "./task-registry.store.sqlite.js";
import type { TaskRecord } from "./task-registry.types.js";

function createStoredTask(): TaskRecord {
  return {
    taskId: "task-restored",
    runtime: "acp",
    sourceId: "run-restored",
    requesterSessionKey: "agent:main:main",
    childSessionKey: "agent:codex:acp:restored",
    runId: "run-restored",
    task: "Restored task",
    status: "running",
    deliveryStatus: "pending",
    notifyPolicy: "done_only",
    createdAt: 100,
    lastEventAt: 100,
  };
}

describe("task-registry store runtime", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_STATE_DIR;
    resetTaskRegistryForTests();
  });

  it("uses the configured task store for restore and save", () => {
    const storedTask = createStoredTask();
    const loadSnapshot = vi.fn(() => ({
      tasks: new Map([[storedTask.taskId, storedTask]]),
      deliveryStates: new Map(),
    }));
    const saveSnapshot = vi.fn();
    configureTaskRegistryRuntime({
      store: {
        loadSnapshot,
        saveSnapshot,
      },
    });

    expect(findTaskByRunId("run-restored")).toMatchObject({
      taskId: "task-restored",
      task: "Restored task",
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    createTaskRecord({
      runtime: "acp",
      requesterSessionKey: "agent:main:main",
      childSessionKey: "agent:codex:acp:new",
      runId: "run-new",
      task: "New task",
      status: "running",
      deliveryStatus: "pending",
    });

    expect(saveSnapshot).toHaveBeenCalled();
    const latestSnapshot = saveSnapshot.mock.calls.at(-1)?.[0] as {
      tasks: ReadonlyMap<string, TaskRecord>;
    };
    expect(latestSnapshot.tasks.size).toBe(2);
    expect(latestSnapshot.tasks.get("task-restored")?.task).toBe("Restored task");
  });

  it("emits incremental hook events for restore, mutation, and delete", () => {
    const events: TaskRegistryHookEvent[] = [];
    configureTaskRegistryRuntime({
      store: {
        loadSnapshot: () => ({
          tasks: new Map([[createStoredTask().taskId, createStoredTask()]]),
          deliveryStates: new Map(),
        }),
        saveSnapshot: () => {},
      },
      hooks: {
        onEvent: (event) => {
          events.push(event);
        },
      },
    });

    expect(findTaskByRunId("run-restored")).toBeTruthy();
    const created = createTaskRecord({
      runtime: "acp",
      requesterSessionKey: "agent:main:main",
      childSessionKey: "agent:codex:acp:new",
      runId: "run-new",
      task: "New task",
      status: "running",
      deliveryStatus: "pending",
    });
    expect(deleteTaskRecordById(created.taskId)).toBe(true);

    expect(events.map((event) => event.kind)).toEqual(["restored", "upserted", "deleted"]);
    expect(events[0]).toMatchObject({
      kind: "restored",
      tasks: [expect.objectContaining({ taskId: "task-restored" })],
    });
    expect(events[1]).toMatchObject({
      kind: "upserted",
      task: expect.objectContaining({ taskId: created.taskId }),
    });
    expect(events[2]).toMatchObject({
      kind: "deleted",
      taskId: created.taskId,
    });
  });

  it("prefers atomic task-plus-delivery persistence when the store provides it", () => {
    const upsertTaskWithDeliveryState = vi.fn();
    const deleteTaskWithDeliveryState = vi.fn();
    configureTaskRegistryRuntime({
      store: {
        loadSnapshot: () => ({
          tasks: new Map(),
          deliveryStates: new Map(),
        }),
        saveSnapshot: vi.fn(),
        upsertTaskWithDeliveryState,
        deleteTaskWithDeliveryState,
      },
    });

    const created = createTaskRecord({
      runtime: "acp",
      requesterSessionKey: "agent:main:main",
      requesterOrigin: {
        channel: "telegram",
        to: "telegram:123",
      },
      childSessionKey: "agent:codex:acp:new",
      runId: "run-atomic",
      task: "Atomic task",
      status: "running",
      deliveryStatus: "pending",
    });

    expect(upsertTaskWithDeliveryState).toHaveBeenCalledWith({
      task: expect.objectContaining({
        taskId: created.taskId,
        runId: "run-atomic",
      }),
      deliveryState: expect.objectContaining({
        taskId: created.taskId,
        requesterOrigin: {
          channel: "telegram",
          to: "telegram:123",
        },
      }),
    });

    expect(deleteTaskRecordById(created.taskId)).toBe(true);
    expect(deleteTaskWithDeliveryState).toHaveBeenCalledWith(created.taskId);
  });

  it("restores persisted tasks from the default sqlite store", () => {
    const created = createTaskRecord({
      runtime: "cron",
      requesterSessionKey: "agent:main:main",
      sourceId: "job-123",
      runId: "run-sqlite",
      task: "Run nightly cron",
      status: "running",
      deliveryStatus: "not_applicable",
      notifyPolicy: "silent",
    });

    resetTaskRegistryForTests({ persist: false });

    expect(findTaskByRunId("run-sqlite")).toMatchObject({
      taskId: created.taskId,
      sourceId: "job-123",
      task: "Run nightly cron",
    });
  });

  it("persists parent flow linkage on task records", () => {
    const created = createTaskRecord({
      runtime: "acp",
      requesterSessionKey: "agent:main:main",
      parentFlowId: "flow-123",
      runId: "run-linked",
      task: "Linked task",
      status: "running",
      deliveryStatus: "pending",
    });

    resetTaskRegistryForTests({ persist: false });

    expect(findTaskByRunId("run-linked")).toMatchObject({
      taskId: created.taskId,
      parentFlowId: "flow-123",
      task: "Linked task",
    });
  });

  it("ignores orphaned delivery rows during sqlite restore", () => {
    const stateDir = mkdtempSync(path.join(os.tmpdir(), "openclaw-task-store-orphan-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;

    const created = createTaskRecord({
      runtime: "acp",
      requesterSessionKey: "agent:main:main",
      requesterOrigin: {
        channel: "telegram",
        to: "telegram:123",
      },
      childSessionKey: "agent:codex:acp:orphan",
      runId: "run-orphan",
      task: "Task with delivery metadata",
      status: "running",
      deliveryStatus: "pending",
    });

    const sqlitePath = resolveTaskRegistrySqlitePath(process.env);
    const { DatabaseSync } = requireNodeSqlite();
    const db = new DatabaseSync(sqlitePath);
    db.prepare("DELETE FROM task_runs WHERE task_id = ?").run(created.taskId);
    db.close();

    resetTaskRegistryForTests({ persist: false });

    const restored = loadTaskRegistryStateFromSqlite();
    expect(restored.tasks.size).toBe(0);
    expect(restored.deliveryStates.size).toBe(0);

    resetTaskRegistryForTests();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("hardens the sqlite task store directory and file modes", () => {
    if (process.platform === "win32") {
      return;
    }
    const stateDir = mkdtempSync(path.join(os.tmpdir(), "openclaw-task-store-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;

    createTaskRecord({
      runtime: "cron",
      requesterSessionKey: "agent:main:main",
      sourceId: "job-456",
      runId: "run-perms",
      task: "Run secured cron",
      status: "running",
      deliveryStatus: "not_applicable",
      notifyPolicy: "silent",
    });

    const registryDir = resolveTaskRegistryDir(process.env);
    const sqlitePath = resolveTaskRegistrySqlitePath(process.env);
    expect(statSync(registryDir).mode & 0o777).toBe(0o700);
    expect(statSync(sqlitePath).mode & 0o777).toBe(0o600);

    resetTaskRegistryForTests();
    rmSync(stateDir, { recursive: true, force: true });
  });
});
