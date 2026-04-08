import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildKovaCoverageFromQaCatalog,
  buildKovaCoverageFromScenarioResults,
} from "../../catalog/qa.js";
import type { KovaRunArtifact } from "../../contracts/run-artifact.js";
import { kovaRunArtifactSchema } from "../../contracts/run-artifact.js";
import { ensureDir, resolveKovaRunDir, writeJsonFile, writeTextFile } from "../../lib/fs.js";
import { resolveGitCommit, resolveGitDirty } from "../../lib/git.js";
import { updateKovaRunIndex } from "../../lib/run-index.js";
import { readKovaBackend } from "../registry.js";
import type { KovaBackend, KovaBackendRunSelection } from "../types.js";
import { renderGuestRunScript } from "./bootstrap.js";
import { multipassDefaultQaScenarioIds, multipassDefaultResourceProfile } from "./defaults.js";
import { buildMultipassPlan } from "./plan.js";
import {
  buildQaScenarioResultsFromSummary,
  deriveQaClassification,
  deriveQaVerdict,
  readQaSummary,
} from "./qa-summary.js";
import {
  appendMultipassLog,
  mountMultipassRepo,
  resolveMultipassAvailability,
  runMultipassCommand,
  waitForMultipassGuestReady,
} from "./runtime.js";

function createMultipassBaseArtifact(params: {
  selection: KovaBackendRunSelection;
  providerMode: "mock-openai" | "live-frontier";
  gitCommit?: string;
  gitDirty: boolean;
  scenarioMode: "explicit" | "backend-default";
}): Pick<
  KovaRunArtifact,
  "schemaVersion" | "runId" | "selection" | "scenario" | "backend" | "environment" | "coverage"
> {
  const backend = readKovaBackend("multipass");
  if (!backend) {
    throw new Error("Kova backend metadata missing for multipass");
  }
  return {
    schemaVersion: 1,
    runId: params.selection.runId,
    selection: {
      command: "run",
      target: params.selection.target,
      suite: "qa-suite",
      scenarioMode: params.scenarioMode,
      scenarioIds:
        params.selection.scenarioIds && params.selection.scenarioIds.length > 0
          ? params.selection.scenarioIds
          : undefined,
    },
    scenario: {
      id: params.selection.target,
      title: "QA suite",
      category: "behavior",
      capabilities: ["lane.qa", "workflow.behavior"],
    },
    backend: {
      id: backend.id,
      title: backend.title,
      kind: backend.kind,
      runner: backend.runner,
      mode: params.providerMode,
      binary: backend.binary,
    },
    environment: {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      gitCommit: params.gitCommit,
      gitDirty: params.gitDirty,
    },
    coverage: buildKovaCoverageFromQaCatalog(params.selection.scenarioIds),
  };
}

function resolveMultipassRunSelection(selection: KovaBackendRunSelection) {
  if (selection.scenarioIds && selection.scenarioIds.length > 0) {
    return {
      selection,
      scenarioMode: "explicit" as const,
    };
  }
  return {
    selection: {
      ...selection,
      scenarioIds: [...multipassDefaultQaScenarioIds],
    },
    scenarioMode: "backend-default" as const,
  };
}

export const multipassBackend: KovaBackend = {
  id: "multipass",
  title: "Multipass VM",
  kind: "multipass",
  runner: "vm",
  binary: "multipass",
  supportsTarget(target): target is "qa" {
    return target === "qa";
  },
  async run(selection) {
    const resolvedSelection = resolveMultipassRunSelection(selection);
    const startedAt = new Date();
    const runDir = resolveKovaRunDir(
      resolvedSelection.selection.repoRoot,
      resolvedSelection.selection.runId,
    );
    await ensureDir(runDir);

    const hostLogPath = path.join(runDir, "multipass-host.log");
    const hostGuestScriptPath = path.join(runDir, "multipass-guest-run.sh");
    const hostBootstrapLogPath = path.join(runDir, "multipass-guest-bootstrap.log");
    const plan = buildMultipassPlan(resolvedSelection.selection, hostGuestScriptPath);
    const planPath = path.join(runDir, "multipass-plan.json");
    await writeTextFile(hostGuestScriptPath, renderGuestRunScript(plan));
    await writeJsonFile(planPath, plan);
    await writeTextFile(
      hostLogPath,
      `# Kova Multipass host log\nrunId=${resolvedSelection.selection.runId}\n\n`,
    );

    const providerMode = resolvedSelection.selection.providerMode ?? "mock-openai";
    const [gitCommit, gitDirty] = await Promise.all([
      resolveGitCommit(resolvedSelection.selection.repoRoot),
      resolveGitDirty(resolvedSelection.selection.repoRoot),
    ]);
    const baseArtifact = createMultipassBaseArtifact({
      selection: resolvedSelection.selection,
      providerMode,
      gitCommit,
      gitDirty,
      scenarioMode: resolvedSelection.scenarioMode,
    });
    const evidencePaths = [
      runDir,
      planPath,
      hostGuestScriptPath,
      hostLogPath,
      hostBootstrapLogPath,
      path.join(runDir, "run.json"),
    ];

    const availability = await resolveMultipassAvailability();
    if (!availability.available || !availability.binaryPath) {
      const finishedAt = new Date();
      const artifact = kovaRunArtifactSchema.parse({
        ...baseArtifact,
        status: "infra_failed",
        verdict: "blocked",
        classification: {
          domain: "backend",
          reason: "Multipass CLI is not available on this host.",
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
        coverage: baseArtifact.coverage,
        execution: {
          state: "blocked",
          availability: "missing",
          instanceId: plan.vmName,
          cleanup: {
            status: "not_needed",
          },
          resources: {
            profile: multipassDefaultResourceProfile.profile,
            image: plan.image,
            cpus: plan.cpus,
            memory: plan.memory,
            disk: plan.disk,
          },
          paths: {
            artifactRoot: runDir,
            logPath: hostLogPath,
            planPath,
            mountedRepoPath: plan.guestMountedRepoPath,
            guestRepoPath: plan.guestRepoPath,
            guestScriptPath: plan.guestScriptPath,
          },
        },
        scenarioResults: [],
        evidence: {
          sourceArtifactPaths: evidencePaths,
        },
        notes: [
          "backend=multipass",
          "state=missing-cli",
          `vmName=${plan.vmName}`,
          `guestMountedRepoPath=${plan.guestMountedRepoPath}`,
          `guestRepoPath=${plan.guestRepoPath}`,
          `guestScriptPath=${plan.guestScriptPath}`,
          "availability=missing",
        ],
      });
      await writeJsonFile(path.join(runDir, "run.json"), artifact);
      await updateKovaRunIndex(resolvedSelection.selection.repoRoot, artifact);
      return artifact;
    }

    let launched = false;
    let cleanupStatus: KovaRunArtifact["execution"]["cleanup"]["status"] = "not_needed";
    let cleanupDetails: string | undefined;
    const cleanupInstance = async () => {
      if (!launched) {
        return;
      }
      try {
        await runMultipassCommand({
          binaryPath: availability.binaryPath,
          logPath: hostLogPath,
          args: ["delete", "--purge", plan.vmName],
        });
        cleanupStatus = "completed";
      } catch (error) {
        cleanupStatus = "failed";
        cleanupDetails = error instanceof Error ? error.message : String(error);
        await appendMultipassLog(hostLogPath, `CLEANUP ERROR: ${cleanupDetails}\n`);
      }
    };
    try {
      await runMultipassCommand({
        binaryPath: availability.binaryPath,
        logPath: hostLogPath,
        args: [
          "launch",
          "--name",
          plan.vmName,
          "--cpus",
          String(plan.cpus),
          "--memory",
          plan.memory,
          "--disk",
          plan.disk,
          plan.image,
        ],
      });
      launched = true;
      await waitForMultipassGuestReady({
        binaryPath: availability.binaryPath,
        logPath: hostLogPath,
        vmName: plan.vmName,
      });
      await mountMultipassRepo({
        binaryPath: availability.binaryPath,
        logPath: hostLogPath,
        hostRepoPath: resolvedSelection.selection.repoRoot,
        vmName: plan.vmName,
        guestMountedRepoPath: plan.guestMountedRepoPath,
      });
      await runMultipassCommand({
        binaryPath: availability.binaryPath,
        logPath: hostLogPath,
        args: ["transfer", hostGuestScriptPath, `${plan.vmName}:${plan.guestScriptPath}`],
      });
      await runMultipassCommand({
        binaryPath: availability.binaryPath,
        logPath: hostLogPath,
        args: ["exec", plan.vmName, "--", "chmod", "+x", plan.guestScriptPath],
      });
      await runMultipassCommand({
        binaryPath: availability.binaryPath,
        logPath: hostLogPath,
        args: ["exec", plan.vmName, "--", plan.guestScriptPath],
      });
      await runMultipassCommand({
        binaryPath: availability.binaryPath,
        logPath: hostLogPath,
        args: ["transfer", `${plan.vmName}:${plan.guestBootstrapLogPath}`, hostBootstrapLogPath],
      }).catch(() => undefined);

      const reportPath = path.join(runDir, "qa", "qa-suite-report.md");
      const { summaryPath, summary } = await readQaSummary(runDir);
      const reportExists = await readFile(reportPath, "utf8")
        .then(() => true)
        .catch(() => false);
      if (!reportExists) {
        throw new Error(`expected QA report at ${reportPath} after Multipass run`);
      }

      const scenarioResults = buildQaScenarioResultsFromSummary({
        selectedScenarioIds: resolvedSelection.selection.scenarioIds,
        summary,
      });
      await cleanupInstance();
      const finishedAt = new Date();
      const artifact = kovaRunArtifactSchema.parse({
        ...baseArtifact,
        status: "completed",
        verdict: deriveQaVerdict(summary.counts.failed),
        classification: deriveQaClassification(summary.counts.failed),
        timing: {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
        counts: summary.counts,
        coverage: buildKovaCoverageFromScenarioResults(scenarioResults),
        execution: {
          state: "executed",
          availability: "available",
          binaryPath: availability.binaryPath,
          instanceId: plan.vmName,
          cleanup: {
            status: cleanupStatus,
            details: cleanupDetails,
          },
          resources: {
            profile: multipassDefaultResourceProfile.profile,
            image: plan.image,
            cpus: plan.cpus,
            memory: plan.memory,
            disk: plan.disk,
          },
          paths: {
            artifactRoot: runDir,
            logPath: hostLogPath,
            bootstrapLogPath: hostBootstrapLogPath,
            planPath,
            mountedRepoPath: plan.guestMountedRepoPath,
            guestRepoPath: plan.guestRepoPath,
            guestScriptPath: plan.guestScriptPath,
          },
        },
        scenarioResults,
        evidence: {
          reportPath,
          summaryPath,
          sourceArtifactPaths: [...evidencePaths, path.join(runDir, "qa"), reportPath, summaryPath],
        },
        notes: [
          "backend=multipass",
          "state=executed",
          `vmName=${plan.vmName}`,
          `guestMountedRepoPath=${plan.guestMountedRepoPath}`,
          `guestRepoPath=${plan.guestRepoPath}`,
          `guestScriptPath=${plan.guestScriptPath}`,
          `availability=${availability.binaryPath}`,
        ],
      });
      await writeJsonFile(path.join(runDir, "run.json"), artifact);
      await updateKovaRunIndex(resolvedSelection.selection.repoRoot, artifact);
      return artifact;
    } catch (error) {
      await appendMultipassLog(
        hostLogPath,
        `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      if (launched) {
        await runMultipassCommand({
          binaryPath: availability.binaryPath,
          logPath: hostLogPath,
          args: ["transfer", `${plan.vmName}:${plan.guestBootstrapLogPath}`, hostBootstrapLogPath],
        }).catch(() => undefined);
      }
      await cleanupInstance();
      const finishedAt = new Date();
      const artifact = kovaRunArtifactSchema.parse({
        ...baseArtifact,
        status: "infra_failed",
        verdict: "blocked",
        classification: {
          domain: "backend",
          reason: error instanceof Error ? error.message : String(error),
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
        coverage: baseArtifact.coverage,
        execution: {
          state: "failed",
          availability: "available",
          binaryPath: availability.binaryPath,
          instanceId: plan.vmName,
          cleanup: {
            status: cleanupStatus,
            details: cleanupDetails,
          },
          resources: {
            profile: multipassDefaultResourceProfile.profile,
            image: plan.image,
            cpus: plan.cpus,
            memory: plan.memory,
            disk: plan.disk,
          },
          paths: {
            artifactRoot: runDir,
            logPath: hostLogPath,
            planPath,
            mountedRepoPath: plan.guestMountedRepoPath,
            guestRepoPath: plan.guestRepoPath,
            guestScriptPath: plan.guestScriptPath,
            bootstrapLogPath: hostBootstrapLogPath,
          },
        },
        scenarioResults: [],
        evidence: {
          sourceArtifactPaths: evidencePaths,
        },
        notes: [
          "backend=multipass",
          `state=${launched ? "exec-failed" : "launch-failed"}`,
          `vmName=${plan.vmName}`,
          `guestMountedRepoPath=${plan.guestMountedRepoPath}`,
          `guestRepoPath=${plan.guestRepoPath}`,
          `guestScriptPath=${plan.guestScriptPath}`,
          `availability=${availability.binaryPath}`,
        ],
      });
      await writeJsonFile(path.join(runDir, "run.json"), artifact);
      await updateKovaRunIndex(resolvedSelection.selection.repoRoot, artifact);
      return artifact;
    }
  },
};
