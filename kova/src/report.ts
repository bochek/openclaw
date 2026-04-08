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
  const runIds = entries.toSorted((left, right) => left.localeCompare(right));
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
  if (artifact.evidence.reportPath) {
    lines.push(`Report: ${artifact.evidence.reportPath}`);
  }
  if (artifact.evidence.summaryPath) {
    lines.push(`Summary: ${artifact.evidence.summaryPath}`);
  }
  return `${lines.join("\n")}\n`;
}
