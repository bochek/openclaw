import path from "node:path";
import { runQaSuite } from "../../../extensions/qa-lab/api.js";
import { kovaRunArtifactSchema, type KovaRunArtifact } from "../contracts/run-artifact.js";
import { ensureDir, resolveKovaRunDir, writeJsonFile } from "../lib/fs.js";
import { resolveGitCommit, resolveGitDirty } from "../lib/git.js";

export type KovaQaRunOptions = {
  repoRoot: string;
  runId: string;
  providerMode?: "mock-openai" | "live-frontier";
  scenarioIds?: string[];
};

function deriveVerdict(failedCount: number) {
  return failedCount > 0 ? "fail" : "pass";
}

function deriveClassification(failedCount: number) {
  return failedCount > 0
    ? {
        domain: "product" as const,
        reason: "one or more QA scenarios failed",
      }
    : {
        domain: "unknown" as const,
        reason: "all QA scenarios passed",
      };
}

export async function runQaAdapter(opts: KovaQaRunOptions) {
  const startedAt = new Date();
  const runDir = resolveKovaRunDir(opts.repoRoot, opts.runId);
  const qaOutputDir = path.join(runDir, "qa");
  await ensureDir(qaOutputDir);

  const qaResult = await runQaSuite({
    repoRoot: opts.repoRoot,
    outputDir: qaOutputDir,
    providerMode: opts.providerMode ?? "mock-openai",
    scenarioIds: opts.scenarioIds,
  });
  const finishedAt = new Date();
  const counts = {
    total: qaResult.scenarios.length,
    passed: qaResult.scenarios.filter((scenario) => scenario.status === "pass").length,
    failed: qaResult.scenarios.filter((scenario) => scenario.status === "fail").length,
  };

  const artifact = kovaRunArtifactSchema.parse({
    schemaVersion: 1,
    runId: opts.runId,
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
      mode: opts.providerMode ?? "mock-openai",
    },
    environment: {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      gitCommit: await resolveGitCommit(opts.repoRoot),
      gitDirty: await resolveGitDirty(opts.repoRoot),
    },
    status: "completed",
    verdict: deriveVerdict(counts.failed),
    classification: deriveClassification(counts.failed),
    timing: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    },
    counts,
    evidence: {
      reportPath: qaResult.reportPath,
      summaryPath: qaResult.summaryPath,
      sourceArtifactPaths: [qaResult.outputDir, qaResult.reportPath, qaResult.summaryPath],
    },
    notes: [`watchUrl=${qaResult.watchUrl}`, `providerMode=${opts.providerMode ?? "mock-openai"}`],
  } satisfies KovaRunArtifact);

  await writeJsonFile(path.join(runDir, "run.json"), artifact);
  await writeJsonFile(path.join(runDir, "qa-result.json"), qaResult);
  return artifact;
}
