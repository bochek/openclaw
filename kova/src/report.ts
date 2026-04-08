import fs from "node:fs/promises";
import path from "node:path";
import { kovaRunArtifactSchema, type KovaRunArtifact } from "./contracts/run-artifact.js";
import { readJsonFile, resolveKovaRunDir, resolveKovaRunsDir } from "./lib/fs.js";
import { hydrateKovaRunIndex, readKovaRunIndex } from "./lib/run-index.js";

export type KovaArtifactDiff = {
  baselineRunId: string;
  candidateRunId: string;
  environmentChanged: boolean;
  environment: {
    baseline: Pick<
      KovaRunArtifact["environment"],
      "gitCommit" | "gitDirty" | "os" | "arch" | "nodeVersion"
    >;
    candidate: Pick<
      KovaRunArtifact["environment"],
      "gitCommit" | "gitDirty" | "os" | "arch" | "nodeVersion"
    >;
  };
  selectionChanged: boolean;
  backendChanged: boolean;
  verdictChanged: boolean;
  statusChanged: boolean;
  classificationChanged: boolean;
  durationDeltaMs: number;
  countsDelta: {
    total: number;
    passed: number;
    failed: number;
  };
  executionChanged: boolean;
  execution: {
    baseline: KovaRunArtifact["execution"];
    candidate: KovaRunArtifact["execution"];
  };
  coverage: {
    capabilityAreasAdded: string[];
    capabilityAreasRemoved: string[];
    capabilitiesAdded: string[];
    capabilitiesRemoved: string[];
    surfacesAdded: string[];
    surfacesRemoved: string[];
    scenarioIdsAdded: string[];
    scenarioIdsRemoved: string[];
  };
  scenarioResultChanges: Array<{
    id: string;
    baselineVerdict?: KovaRunArtifact["scenarioResults"][number]["verdict"];
    candidateVerdict?: KovaRunArtifact["scenarioResults"][number]["verdict"];
  }>;
};

function diffStringSets(baseline: string[], candidate: string[]) {
  const baselineSet = new Set(baseline);
  const candidateSet = new Set(candidate);
  return {
    added: candidate.filter((value) => !baselineSet.has(value)),
    removed: baseline.filter((value) => !candidateSet.has(value)),
  };
}

function normalizeExecutionForDiff(execution: KovaRunArtifact["execution"]) {
  return {
    state: execution.state,
    availability: execution.availability,
    binaryPath: execution.binaryPath,
    cleanup: execution.cleanup,
  };
}

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

export async function resolvePreviousRunId(repoRoot: string, runId?: string) {
  const index = await hydrateKovaRunIndex(repoRoot).catch(() => null);
  if (!index || index.runs.length === 0) {
    return undefined;
  }
  const targetRunId = runId ?? index.latestRunId;
  if (!targetRunId) {
    return undefined;
  }
  const position = index.runs.findIndex((entry) => entry.runId === targetRunId);
  if (position <= 0) {
    return undefined;
  }
  return index.runs[position - 1]?.runId;
}

export async function readKovaArtifact(repoRoot: string, runId: string) {
  return kovaRunArtifactSchema.parse(
    await readJsonFile<KovaRunArtifact>(path.join(resolveKovaRunDir(repoRoot, runId), "run.json")),
  );
}

export function diffArtifacts(
  baseline: KovaRunArtifact,
  candidate: KovaRunArtifact,
): KovaArtifactDiff {
  const capabilities = diffStringSets(
    baseline.coverage.capabilities,
    candidate.coverage.capabilities,
  );
  const capabilityAreas = diffStringSets(
    baseline.coverage.capabilityAreas,
    candidate.coverage.capabilityAreas,
  );
  const surfaces = diffStringSets(baseline.coverage.surfaces, candidate.coverage.surfaces);
  const scenarioIds = diffStringSets(baseline.coverage.scenarioIds, candidate.coverage.scenarioIds);
  const baselineScenarioResults = new Map(
    baseline.scenarioResults.map((scenario) => [scenario.id, scenario]),
  );
  const candidateScenarioResults = new Map(
    candidate.scenarioResults.map((scenario) => [scenario.id, scenario]),
  );
  const scenarioResultIds = [
    ...new Set([...baselineScenarioResults.keys(), ...candidateScenarioResults.keys()]),
  ].toSorted();

  return {
    baselineRunId: baseline.runId,
    candidateRunId: candidate.runId,
    environmentChanged:
      JSON.stringify(baseline.environment) !== JSON.stringify(candidate.environment),
    environment: {
      baseline: {
        gitCommit: baseline.environment.gitCommit,
        gitDirty: baseline.environment.gitDirty,
        os: baseline.environment.os,
        arch: baseline.environment.arch,
        nodeVersion: baseline.environment.nodeVersion,
      },
      candidate: {
        gitCommit: candidate.environment.gitCommit,
        gitDirty: candidate.environment.gitDirty,
        os: candidate.environment.os,
        arch: candidate.environment.arch,
        nodeVersion: candidate.environment.nodeVersion,
      },
    },
    selectionChanged: JSON.stringify(baseline.selection) !== JSON.stringify(candidate.selection),
    backendChanged: JSON.stringify(baseline.backend) !== JSON.stringify(candidate.backend),
    verdictChanged: baseline.verdict !== candidate.verdict,
    statusChanged: baseline.status !== candidate.status,
    classificationChanged:
      baseline.classification.domain !== candidate.classification.domain ||
      baseline.classification.reason !== candidate.classification.reason,
    durationDeltaMs: candidate.timing.durationMs - baseline.timing.durationMs,
    countsDelta: {
      total: candidate.counts.total - baseline.counts.total,
      passed: candidate.counts.passed - baseline.counts.passed,
      failed: candidate.counts.failed - baseline.counts.failed,
    },
    executionChanged:
      JSON.stringify(normalizeExecutionForDiff(baseline.execution)) !==
      JSON.stringify(normalizeExecutionForDiff(candidate.execution)),
    execution: {
      baseline: baseline.execution,
      candidate: candidate.execution,
    },
    coverage: {
      capabilityAreasAdded: capabilityAreas.added,
      capabilityAreasRemoved: capabilityAreas.removed,
      capabilitiesAdded: capabilities.added,
      capabilitiesRemoved: capabilities.removed,
      surfacesAdded: surfaces.added,
      surfacesRemoved: surfaces.removed,
      scenarioIdsAdded: scenarioIds.added,
      scenarioIdsRemoved: scenarioIds.removed,
    },
    scenarioResultChanges: scenarioResultIds
      .map((id) => ({
        id,
        baselineVerdict: baselineScenarioResults.get(id)?.verdict,
        candidateVerdict: candidateScenarioResults.get(id)?.verdict,
      }))
      .filter((change) => change.baselineVerdict !== change.candidateVerdict),
  };
}

export function renderArtifactDiff(
  diff: KovaArtifactDiff,
  baseline: KovaRunArtifact,
  candidate: KovaRunArtifact,
) {
  const lines = [
    `Baseline: ${diff.baselineRunId} (${baseline.verdict})`,
    `Candidate: ${diff.candidateRunId} (${candidate.verdict})`,
    `Environment Changed: ${diff.environmentChanged ? "yes" : "no"}`,
    `Selection Changed: ${diff.selectionChanged ? "yes" : "no"}`,
    `Backend Changed: ${diff.backendChanged ? "yes" : "no"}`,
    `Verdict Changed: ${diff.verdictChanged ? "yes" : "no"}`,
    `Status Changed: ${diff.statusChanged ? "yes" : "no"}`,
    `Classification Changed: ${diff.classificationChanged ? "yes" : "no"}`,
    `Duration Delta: ${diff.durationDeltaMs >= 0 ? "+" : ""}${diff.durationDeltaMs}ms`,
    `Count Delta: total=${diff.countsDelta.total >= 0 ? "+" : ""}${diff.countsDelta.total}, passed=${diff.countsDelta.passed >= 0 ? "+" : ""}${diff.countsDelta.passed}, failed=${diff.countsDelta.failed >= 0 ? "+" : ""}${diff.countsDelta.failed}`,
    `Execution Changed: ${diff.executionChanged ? "yes" : "no"}`,
  ];

  if (diff.environmentChanged) {
    lines.push(
      `Environment: ${diff.environment.baseline.gitCommit ?? "unknown"} (${diff.environment.baseline.nodeVersion}) -> ${diff.environment.candidate.gitCommit ?? "unknown"} (${diff.environment.candidate.nodeVersion})`,
    );
  }

  const coverageLines = [
    ["Scenario IDs Added", diff.coverage.scenarioIdsAdded],
    ["Scenario IDs Removed", diff.coverage.scenarioIdsRemoved],
    ["Capability Areas Added", diff.coverage.capabilityAreasAdded],
    ["Capability Areas Removed", diff.coverage.capabilityAreasRemoved],
    ["Capabilities Added", diff.coverage.capabilitiesAdded],
    ["Capabilities Removed", diff.coverage.capabilitiesRemoved],
    ["Surfaces Added", diff.coverage.surfacesAdded],
    ["Surfaces Removed", diff.coverage.surfacesRemoved],
  ] as const;

  for (const [label, values] of coverageLines) {
    if (values.length > 0) {
      lines.push(`${label}: ${values.join(", ")}`);
    }
  }

  if (diff.executionChanged) {
    lines.push(
      `Execution States: ${diff.execution.baseline.state}/${diff.execution.baseline.availability} -> ${diff.execution.candidate.state}/${diff.execution.candidate.availability}`,
    );
  }

  if (diff.scenarioResultChanges.length > 0) {
    lines.push("Scenario Verdict Changes:");
    lines.push(
      ...diff.scenarioResultChanges.map(
        (change) =>
          `  - ${change.id}: ${change.baselineVerdict ?? "missing"} -> ${change.candidateVerdict ?? "missing"}`,
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function renderArtifactSummary(artifact: KovaRunArtifact) {
  const backendLabel = artifact.backend.id ?? artifact.backend.kind;
  const backendTitle = artifact.backend.title ? ` - ${artifact.backend.title}` : "";
  const lines = [
    `Run: ${artifact.runId}`,
    `Target: ${artifact.selection.target}`,
    `Backend: ${backendLabel}${backendTitle}${artifact.backend.mode ? ` (${artifact.backend.mode})` : ""}`,
    `Verdict: ${artifact.verdict}`,
    `Classification: ${artifact.classification.domain} - ${artifact.classification.reason}`,
    `Counts: ${artifact.counts.passed}/${artifact.counts.total} passed, ${artifact.counts.failed} failed`,
    `Duration: ${artifact.timing.durationMs}ms`,
  ];
  if (artifact.coverage.scenarioIds.length > 0) {
    lines.push(
      `Coverage: ${artifact.coverage.scenarioIds.length} scenario(s), ${artifact.coverage.surfaces.length} surface(s), ${artifact.coverage.capabilities.length} capability id(s), ${artifact.coverage.capabilityAreas.length} capability area(s)`,
    );
  }
  lines.push(
    `Execution: ${artifact.execution.state} (${artifact.execution.availability})${artifact.execution.instanceId ? ` [${artifact.execution.instanceId}]` : ""}`,
  );
  if (artifact.execution.binaryPath) {
    lines.push(`Binary: ${artifact.execution.binaryPath}`);
  }
  if (artifact.coverage.capabilityAreas.length > 0) {
    lines.push(`Capability Areas: ${artifact.coverage.capabilityAreas.join(", ")}`);
  }
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
  if (artifact.execution.paths.planPath) {
    lines.push(`Plan: ${artifact.execution.paths.planPath}`);
  }
  if (artifact.execution.paths.logPath) {
    lines.push(`Backend Log: ${artifact.execution.paths.logPath}`);
  }
  if (artifact.notes.length > 0) {
    lines.push("Notes:");
    lines.push(...artifact.notes.map((note) => `  - ${note}`));
  }
  return `${lines.join("\n")}\n`;
}
