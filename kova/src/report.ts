import fs from "node:fs/promises";
import path from "node:path";
import type { KovaRunArtifact } from "./contracts/run-artifact.js";
import { readJsonFile, resolveKovaRunDir, resolveKovaRunsDir } from "./lib/fs.js";
import { readKovaRunIndex } from "./lib/run-index.js";

export async function resolveLatestRunId(repoRoot: string) {
  const index = await readKovaRunIndex(repoRoot).catch(() => null);
  if (index?.latestRunId) {
    return index.latestRunId;
  }
  const runsDir = resolveKovaRunsDir(repoRoot);
  const entries = await fs.readdir(runsDir).catch(() => []);
  const completedRunIds: string[] = [];
  for (const runId of entries.toSorted((left, right) => left.localeCompare(right))) {
    const runPath = path.join(resolveKovaRunDir(repoRoot, runId), "run.json");
    const exists = await fs
      .access(runPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      completedRunIds.push(runId);
    }
  }
  const runIds = completedRunIds;
  return runIds.at(-1);
}

export async function readKovaArtifact(repoRoot: string, runId: string) {
  return await readJsonFile<KovaRunArtifact>(
    path.join(resolveKovaRunDir(repoRoot, runId), "run.json"),
  );
}

export function renderArtifactSummary(artifact: KovaRunArtifact) {
  const lines = [
    `Run: ${artifact.runId}`,
    `Target: ${artifact.selection.target}`,
    `Backend: ${artifact.backend.kind}${artifact.backend.mode ? ` (${artifact.backend.mode})` : ""}`,
    `Verdict: ${artifact.verdict}`,
    `Classification: ${artifact.classification.domain} - ${artifact.classification.reason}`,
    `Counts: ${artifact.counts.passed}/${artifact.counts.total} passed, ${artifact.counts.failed} failed`,
    `Duration: ${artifact.timing.durationMs}ms`,
  ];
  if (artifact.selection.scenarioIds?.length) {
    lines.push(`Selected Scenarios: ${artifact.selection.scenarioIds.join(", ")}`);
  }
  if (artifact.scenarioResults.length > 0) {
    lines.push("Scenario Results:");
    const scenarioLines = artifact.scenarioResults.map((scenario) => {
      const counts = `${scenario.stepCounts.passed}/${scenario.stepCounts.total} steps passed`;
      const details = scenario.details ? ` - ${scenario.details}` : "";
      return `  - [${scenario.verdict}] ${scenario.id} (${counts})${details}`;
    });
    lines.push(...scenarioLines);
  }
  if (artifact.evidence.reportPath) {
    lines.push(`Report: ${artifact.evidence.reportPath}`);
  }
  if (artifact.evidence.summaryPath) {
    lines.push(`Summary: ${artifact.evidence.summaryPath}`);
  }
  if (artifact.evidence.sourceArtifactPaths.length > 0) {
    lines.push(`Artifacts: ${artifact.evidence.sourceArtifactPaths.length} path(s) captured`);
  }
  return `${lines.join("\n")}\n`;
}
