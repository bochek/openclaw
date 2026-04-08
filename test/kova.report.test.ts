import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { kovaRunArtifactSchema } from "../kova/src/contracts/run-artifact.js";
import { renderArtifactSummary, resolveLatestRunId } from "../kova/src/report.js";

const tempDirs: string[] = [];

async function createTempRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-kova-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("kova artifact contract", () => {
  it("accepts scenario-level results in the run artifact", () => {
    const artifact = kovaRunArtifactSchema.parse({
      schemaVersion: 1,
      runId: "kova_test_001",
      selection: {
        command: "run",
        target: "qa",
        suite: "qa-suite",
      },
      scenario: {
        id: "qa",
        title: "QA suite",
        category: "behavior",
        capabilities: ["behavior", "qa"],
      },
      backend: {
        kind: "host",
        mode: "mock-openai",
      },
      environment: {
        os: "darwin",
        arch: "arm64",
        nodeVersion: "v24.0.0",
        gitCommit: "abc1234",
        gitDirty: false,
      },
      status: "completed",
      verdict: "pass",
      classification: {
        domain: "product",
        reason: "all QA scenarios passed under current selection",
      },
      timing: {
        startedAt: "2026-04-08T11:00:00.000Z",
        finishedAt: "2026-04-08T11:00:05.000Z",
        durationMs: 5000,
      },
      counts: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarioResults: [
        {
          id: "channel-chat-baseline",
          title: "Channel baseline conversation",
          verdict: "pass",
          stepCounts: {
            total: 2,
            passed: 2,
            failed: 0,
          },
        },
      ],
      evidence: {
        sourceArtifactPaths: ["./qa"],
      },
      notes: [],
    });

    expect(artifact.scenarioResults[0]?.id).toBe("channel-chat-baseline");
    expect(artifact.scenarioResults[0]?.stepCounts.total).toBe(2);
  });
});

describe("kova reporting", () => {
  it("renders scenario-level results in the report summary", () => {
    const artifact = kovaRunArtifactSchema.parse({
      schemaVersion: 1,
      runId: "kova_test_002",
      selection: {
        command: "run",
        target: "qa",
      },
      scenario: {
        id: "qa",
        title: "QA suite",
        category: "behavior",
        capabilities: ["behavior"],
      },
      backend: {
        kind: "host",
      },
      environment: {
        os: "darwin",
        arch: "arm64",
        nodeVersion: "v24.0.0",
        gitDirty: false,
      },
      status: "completed",
      verdict: "pass",
      classification: {
        domain: "product",
        reason: "all QA scenarios passed under current selection",
      },
      timing: {
        startedAt: "2026-04-08T11:00:00.000Z",
        finishedAt: "2026-04-08T11:00:05.000Z",
        durationMs: 5000,
      },
      counts: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarioResults: [
        {
          id: "channel-chat-baseline",
          title: "Channel baseline conversation",
          verdict: "pass",
          stepCounts: {
            total: 2,
            passed: 2,
            failed: 0,
          },
        },
      ],
      evidence: {
        reportPath: "/tmp/report.md",
        summaryPath: "/tmp/summary.json",
        sourceArtifactPaths: ["/tmp/report.md", "/tmp/summary.json"],
      },
      notes: [],
    });

    const summary = renderArtifactSummary(artifact);
    expect(summary).toContain("Scenario Results:");
    expect(summary).toContain("[pass] channel-chat-baseline");
    expect(summary).toContain("Artifacts: 2 path(s) captured");
  });

  it("resolves latest run id from the run index", async () => {
    const repoRoot = await createTempRepo();
    const kovaRoot = path.join(repoRoot, ".artifacts", "kova");
    await fs.mkdir(kovaRoot, { recursive: true });
    await fs.writeFile(
      path.join(kovaRoot, "run-index.json"),
      `${JSON.stringify(
        {
          latestRunId: "kova_test_003",
          runs: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(resolveLatestRunId(repoRoot)).resolves.toBe("kova_test_003");
  });
});
