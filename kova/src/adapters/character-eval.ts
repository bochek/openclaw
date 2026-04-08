import path from "node:path";
import {
  runQaCharacterEval,
  type QaCharacterEvalJudgment,
  type QaCharacterEvalResult,
  type QaCharacterEvalRun,
} from "../../../extensions/qa-lab/api.js";
import { readKovaBackend } from "../backends/registry.js";
import { summarizeKovaCapabilityAreas } from "../capabilities/registry.js";
import {
  kovaRunArtifactSchema,
  type KovaRunArtifact,
  type KovaScenarioResult,
} from "../contracts/run-artifact.js";
import { ensureDir, resolveKovaRunDir, writeJsonFile } from "../lib/fs.js";
import { resolveGitCommit, resolveGitDirty } from "../lib/git.js";
import { updateKovaRunIndex } from "../lib/run-index.js";

export type KovaCharacterEvalRunOptions = {
  repoRoot: string;
  runId: string;
  scenarioId?: string;
  modelRefs?: string[];
  judgeModel?: string;
  judgeTimeoutMs?: number;
  candidateFastMode?: boolean;
};

const characterEvalCapabilities = [
  "lane.character-eval",
  "character.roleplay",
  "evaluation.judged-ranking",
] as const;

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildCharacterEvalCoverage(params: { scenarioId?: string }) {
  const capabilities = [...characterEvalCapabilities];
  return {
    scenarioIds: params.scenarioId ? [params.scenarioId] : [],
    capabilities,
    capabilityAreas: summarizeKovaCapabilityAreas(capabilities),
    surfaces: ["character"],
  };
}

function buildCharacterEvalScenarioResults(params: {
  scenarioId: string;
  runs: QaCharacterEvalRun[];
  rankings: QaCharacterEvalJudgment[];
}) {
  const rankingByModel = new Map(params.rankings.map((ranking) => [ranking.model, ranking]));
  return params.runs.map((run) => {
    const ranking = rankingByModel.get(run.model);
    const details = [
      ranking ? `rank ${ranking.rank} | score ${ranking.score.toFixed(1)}` : "",
      ranking?.summary ?? "",
      run.error ? `error: ${run.error}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    return {
      id: `${params.scenarioId}::${run.model}`,
      title: run.model,
      verdict: run.status,
      capabilities: ["character.roleplay"],
      surface: "character",
      details: details || undefined,
      stepCounts: {
        total: 1,
        passed: run.status === "pass" ? 1 : 0,
        failed: run.status === "fail" ? 1 : 0,
      },
    } satisfies KovaScenarioResult;
  });
}

function deriveCharacterEvalVerdict(params: {
  failedRunCount: number;
  judgmentError?: string;
}): KovaRunArtifact["verdict"] {
  if (params.failedRunCount > 0) {
    return "fail";
  }
  if (params.judgmentError) {
    return "degraded";
  }
  return "pass";
}

function deriveCharacterEvalClassification(params: {
  totalRuns: number;
  failedRuns: QaCharacterEvalRun[];
  judgmentError?: string;
}) {
  if (params.failedRuns.length === 0) {
    return params.judgmentError
      ? {
          domain: "backend" as const,
          reason: "candidate runs completed but the judge did not produce rankings",
        }
      : {
          domain: "product" as const,
          reason: "candidate runs completed and the judge produced rankings",
        };
  }
  if (params.failedRuns.length === params.totalRuns) {
    return {
      domain: "backend" as const,
      reason: "all character eval candidate runs failed",
    };
  }
  return {
    domain: "product" as const,
    reason: "one or more character eval candidate runs failed",
  };
}

function buildEvidencePaths(result: QaCharacterEvalResult) {
  return [
    result.outputDir,
    result.reportPath,
    result.summaryPath,
    ...result.runs.flatMap((run) =>
      [run.outputDir, run.reportPath, run.summaryPath].filter((value): value is string =>
        Boolean(value),
      ),
    ),
  ];
}

export async function runCharacterEvalAdapter(opts: KovaCharacterEvalRunOptions) {
  const startedAt = new Date();
  const runDir = resolveKovaRunDir(opts.repoRoot, opts.runId);
  const outputDir = path.join(runDir, "character-eval");
  await ensureDir(outputDir);

  const backend = readKovaBackend("host");
  if (!backend) {
    throw new Error("Kova backend metadata missing for host");
  }

  const [gitCommit, gitDirty] = await Promise.all([
    resolveGitCommit(opts.repoRoot),
    resolveGitDirty(opts.repoRoot),
  ]);
  const scenarioId = opts.scenarioId?.trim() || "character-vibes-gollum";
  const modelRefs = opts.modelRefs?.filter(Boolean);
  const baseArtifact = {
    schemaVersion: 1 as const,
    runId: opts.runId,
    selection: {
      command: "run",
      target: "character-eval",
      suite: "character-eval",
      scenarioMode: "explicit" as const,
      scenarioIds: [scenarioId],
      modelRefs: modelRefs && modelRefs.length > 0 ? modelRefs : undefined,
      axes: {
        judgeModel: opts.judgeModel?.trim() || "openai/gpt-5.4",
        fast: opts.candidateFastMode ? "on" : "off",
      },
    },
    scenario: {
      id: "character-eval",
      title: "Character eval",
      category: "evaluation",
      capabilities: [...characterEvalCapabilities],
    },
    backend: {
      id: backend.id,
      title: backend.title,
      kind: backend.kind,
      runner: backend.runner,
      mode: "live-frontier",
      binary: backend.binary,
    },
    environment: {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      gitCommit,
      gitDirty,
    },
    coverage: buildCharacterEvalCoverage({ scenarioId }),
  };

  try {
    const result = await runQaCharacterEval({
      repoRoot: opts.repoRoot,
      outputDir,
      models: modelRefs ?? [],
      scenarioId,
      candidateFastMode: opts.candidateFastMode,
      judgeModel: opts.judgeModel,
      judgeTimeoutMs: opts.judgeTimeoutMs,
    });
    const finishedAt = new Date();
    const failedRuns = result.runs.filter((run) => run.status === "fail");
    const scenarioResults = buildCharacterEvalScenarioResults({
      scenarioId,
      runs: result.runs,
      rankings: result.judgment.rankings,
    });
    const artifact = kovaRunArtifactSchema.parse({
      ...baseArtifact,
      selection: {
        ...baseArtifact.selection,
        modelRefs: result.runs.map((run) => run.model),
        axes: {
          ...baseArtifact.selection.axes,
          judgeModel: result.judgment.model,
        },
      },
      status: "completed",
      verdict: deriveCharacterEvalVerdict({
        failedRunCount: failedRuns.length,
        judgmentError: result.judgment.error,
      }),
      classification: deriveCharacterEvalClassification({
        totalRuns: result.runs.length,
        failedRuns,
        judgmentError: result.judgment.error,
      }),
      timing: {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
      counts: {
        total: result.runs.length,
        passed: result.runs.filter((run) => run.status === "pass").length,
        failed: failedRuns.length,
      },
      judgment: result.judgment,
      execution: {
        state: "executed",
        availability: "available",
        cleanup: {
          status: "not_needed",
        },
        paths: {
          artifactRoot: outputDir,
        },
      },
      scenarioResults,
      evidence: {
        reportPath: result.reportPath,
        summaryPath: result.summaryPath,
        sourceArtifactPaths: buildEvidencePaths(result),
      },
      notes: [`scenarioId=${scenarioId}`],
    } satisfies KovaRunArtifact);

    await writeJsonFile(path.join(runDir, "run.json"), artifact);
    await writeJsonFile(path.join(runDir, "character-eval-result.json"), result);
    await updateKovaRunIndex(opts.repoRoot, artifact);
    return artifact;
  } catch (error) {
    const finishedAt = new Date();
    const artifact = kovaRunArtifactSchema.parse({
      ...baseArtifact,
      status: "infra_failed",
      verdict: "blocked",
      classification: {
        domain: "backend" as const,
        reason: describeError(error),
      },
      timing: {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
      counts: {
        total: 0,
        passed: 0,
        failed: 0,
      },
      execution: {
        state: "failed",
        availability: "available",
        cleanup: {
          status: "not_needed",
        },
        paths: {
          artifactRoot: outputDir,
        },
      },
      scenarioResults: [],
      evidence: {
        sourceArtifactPaths: [outputDir],
      },
      notes: [`scenarioId=${scenarioId}`],
    } satisfies KovaRunArtifact);
    await writeJsonFile(path.join(runDir, "run.json"), artifact);
    await updateKovaRunIndex(opts.repoRoot, artifact);
    throw error;
  }
}
