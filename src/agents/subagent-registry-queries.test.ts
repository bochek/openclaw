import { describe, expect, it } from "vitest";
import {
  countPendingDescendantRunsExcludingRunFromRuns,
  countPendingDescendantRunsFromRuns,
  shouldIgnorePostCompletionAnnounceForSessionFromRuns,
} from "./subagent-registry-queries.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

function makeRun(overrides: Partial<SubagentRunRecord>): SubagentRunRecord {
  const runId = overrides.runId ?? "run-default";
  const childSessionKey = overrides.childSessionKey ?? `agent:main:subagent:${runId}`;
  const requesterSessionKey = overrides.requesterSessionKey ?? "agent:main:main";
  return {
    runId,
    childSessionKey,
    requesterSessionKey,
    requesterDisplayKey: requesterSessionKey,
    task: "test task",
    cleanup: "keep",
    createdAt: overrides.createdAt ?? 1,
    ...overrides,
  };
}

function toRunMap(runs: SubagentRunRecord[]): Map<string, SubagentRunRecord> {
  return new Map(runs.map((run) => [run.runId, run]));
}

describe("subagent registry query regressions", () => {
  it("regression descendant count gating, pending descendants block announce until cleanup completion is recorded", () => {
    // Regression guard: parent announce must defer while any descendant cleanup is still pending.
    const parentSessionKey = "agent:main:subagent:parent";
    const runs = toRunMap([
      makeRun({
        runId: "run-parent",
        childSessionKey: parentSessionKey,
        requesterSessionKey: "agent:main:main",
        endedAt: 100,
        cleanupCompletedAt: undefined,
      }),
      makeRun({
        runId: "run-child-fast",
        childSessionKey: `${parentSessionKey}:subagent:fast`,
        requesterSessionKey: parentSessionKey,
        endedAt: 110,
        cleanupCompletedAt: 120,
      }),
      makeRun({
        runId: "run-child-slow",
        childSessionKey: `${parentSessionKey}:subagent:slow`,
        requesterSessionKey: parentSessionKey,
        endedAt: 115,
        cleanupCompletedAt: undefined,
      }),
    ]);

    expect(countPendingDescendantRunsFromRuns(runs, parentSessionKey)).toBe(1);

    runs.set(
      "run-parent",
      makeRun({
        runId: "run-parent",
        childSessionKey: parentSessionKey,
        requesterSessionKey: "agent:main:main",
        endedAt: 100,
        cleanupCompletedAt: 130,
      }),
    );
    runs.set(
      "run-child-slow",
      makeRun({
        runId: "run-child-slow",
        childSessionKey: `${parentSessionKey}:subagent:slow`,
        requesterSessionKey: parentSessionKey,
        endedAt: 115,
        cleanupCompletedAt: 131,
      }),
    );

    expect(countPendingDescendantRunsFromRuns(runs, parentSessionKey)).toBe(0);
  });

  it("regression nested parallel counting, traversal includes child and grandchildren pending states", () => {
    // Regression guard: nested fan-out once under-counted grandchildren and announced too early.
    const parentSessionKey = "agent:main:subagent:parent-nested";
    const middleSessionKey = `${parentSessionKey}:subagent:middle`;
    const runs = toRunMap([
      makeRun({
        runId: "run-middle",
        childSessionKey: middleSessionKey,
        requesterSessionKey: parentSessionKey,
        endedAt: 200,
        cleanupCompletedAt: undefined,
      }),
      makeRun({
        runId: "run-middle-a",
        childSessionKey: `${middleSessionKey}:subagent:a`,
        requesterSessionKey: middleSessionKey,
        endedAt: 210,
        cleanupCompletedAt: 215,
      }),
      makeRun({
        runId: "run-middle-b",
        childSessionKey: `${middleSessionKey}:subagent:b`,
        requesterSessionKey: middleSessionKey,
        endedAt: 211,
        cleanupCompletedAt: undefined,
      }),
    ]);

    expect(countPendingDescendantRunsFromRuns(runs, parentSessionKey)).toBe(2);
    expect(countPendingDescendantRunsFromRuns(runs, middleSessionKey)).toBe(1);
  });

  it("regression excluding current run, countPendingDescendantRunsExcludingRun keeps sibling gating intact", () => {
    // Regression guard: excluding the currently announcing run must not hide sibling pending work.
    const runs = toRunMap([
      makeRun({
        runId: "run-self",
        childSessionKey: "agent:main:subagent:self",
        requesterSessionKey: "agent:main:main",
        endedAt: 100,
        cleanupCompletedAt: undefined,
      }),
      makeRun({
        runId: "run-sibling",
        childSessionKey: "agent:main:subagent:sibling",
        requesterSessionKey: "agent:main:main",
        endedAt: 101,
        cleanupCompletedAt: undefined,
      }),
    ]);

    expect(
      countPendingDescendantRunsExcludingRunFromRuns(runs, "agent:main:main", "run-self"),
    ).toBe(1);
    expect(
      countPendingDescendantRunsExcludingRunFromRuns(runs, "agent:main:main", "run-sibling"),
    ).toBe(1);
  });

  it("regression post-completion gating, run-mode sessions ignore late announces once the latest run is ended", () => {
    // Regression guard: late descendant announces must not reopen completed run-mode sessions.
    const childSessionKey = "agent:main:subagent:orchestrator";
    const runs = toRunMap([
      makeRun({
        runId: "run-older",
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        createdAt: 1,
        endedAt: 10,
        spawnMode: "run",
      }),
      makeRun({
        runId: "run-latest",
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        createdAt: 2,
        endedAt: 20,
        spawnMode: "run",
      }),
    ]);

    expect(shouldIgnorePostCompletionAnnounceForSessionFromRuns(runs, childSessionKey)).toBe(true);
  });

  it("regression post-completion gating, session-mode sessions keep accepting follow-up announces", () => {
    // Regression guard: persistent session-mode orchestrators must continue receiving child completions.
    const childSessionKey = "agent:main:subagent:orchestrator-session";
    const runs = toRunMap([
      makeRun({
        runId: "run-session",
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        createdAt: 3,
        endedAt: 30,
        spawnMode: "session",
      }),
    ]);

    expect(shouldIgnorePostCompletionAnnounceForSessionFromRuns(runs, childSessionKey)).toBe(false);
  });
});
