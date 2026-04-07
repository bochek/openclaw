import { afterEach, describe, expect, it } from "vitest";
import { getTaskById, resetTaskRegistryForTests } from "../tasks/runtime-internal.js";
import {
  completePluginTaskRun,
  createPluginTaskRun,
  failPluginTaskRun,
  recordPluginTaskProgress,
} from "./task-run-runtime.js";

describe("plugin task run runtime", () => {
  afterEach(() => {
    resetTaskRegistryForTests();
  });

  it("creates and completes a system-scoped plugin task", () => {
    const handle = createPluginTaskRun({
      ownerKey: "memory-wiki:import",
      scopeKind: "system",
      label: "Wiki import",
      task: "Import wiki sources from /tmp/vault",
      progressSummary: "Detecting import profile",
    });

    recordPluginTaskProgress({
      handle,
      progressSummary: "Importing 1/2 sources",
    });
    completePluginTaskRun({
      handle,
      progressSummary: "Imported 2 sources",
      terminalSummary: "Imported 2 sources via markdown-vault.",
    });

    expect(getTaskById(handle.taskId)).toMatchObject({
      status: "succeeded",
      runtime: "cli",
      ownerKey: "memory-wiki:import",
      scopeKind: "system",
      progressSummary: "Imported 2 sources",
      terminalSummary: "Imported 2 sources via markdown-vault.",
    });
  });

  it("records failures with formatted error text", () => {
    const handle = createPluginTaskRun({
      requesterSessionKey: "agent:main:test",
      label: "Wiki import",
      task: "Import wiki sources from /tmp/export.json",
    });

    failPluginTaskRun({
      handle,
      error: new Error("boom"),
      progressSummary: "Wiki import failed",
      terminalSummary: "Wiki import failed: boom",
    });

    expect(getTaskById(handle.taskId)).toMatchObject({
      status: "failed",
      requesterSessionKey: "agent:main:test",
      progressSummary: "Wiki import failed",
      terminalSummary: "Wiki import failed: boom",
      error: "boom",
    });
  });
});
