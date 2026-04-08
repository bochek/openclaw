import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { KovaRunArtifact } from "../../contracts/run-artifact.js";
import { kovaRunArtifactSchema } from "../../contracts/run-artifact.js";
import { ensureDir, resolveKovaRunDir, writeJsonFile, writeTextFile } from "../../lib/fs.js";
import { resolveGitCommit, resolveGitDirty } from "../../lib/git.js";
import { updateKovaRunIndex } from "../../lib/run-index.js";
import { readKovaBackend } from "../registry.js";
import type { KovaBackend, KovaBackendRunSelection } from "../types.js";
import {
  buildParallelsBaseCoverage,
  buildParallelsCounts,
  buildParallelsCoverage,
  buildParallelsScenarioResults,
  deriveParallelsClassification,
  deriveParallelsVerdict,
  parallelsSummarySchema,
  type KovaParallelsGuest,
  type KovaParallelsMode,
  type KovaParallelsProvider,
} from "./summary.js";

const parallelsScriptByGuest: Record<KovaParallelsGuest, string> = {
  macos: "scripts/e2e/parallels-macos-smoke.sh",
  windows: "scripts/e2e/parallels-windows-smoke.sh",
  linux: "scripts/e2e/parallels-linux-smoke.sh",
};

const parallelsProviderEnvVar: Record<KovaParallelsProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  minimax: "MINIMAX_API_KEY",
};

function resolveParallelsAxes(selection: KovaBackendRunSelection) {
  const guest = selection.axes?.guest;
  if (guest !== "macos" && guest !== "windows" && guest !== "linux") {
    throw new Error("kova run parallels requires --guest macos|windows|linux");
  }
  const mode = selection.axes?.mode;
  const provider = selection.axes?.provider;
  return {
    guest,
    mode: (mode === "fresh" || mode === "upgrade" || mode === "both"
      ? mode
      : "both") as KovaParallelsMode,
    provider: (provider === "anthropic" || provider === "minimax"
      ? provider
      : "openai") as KovaParallelsProvider,
  };
}

async function commandExists(command: string) {
  try {
    await fs.access(command);
    return true;
  } catch {
    return false;
  }
}

async function resolveParallelsAvailability() {
  const binaryPath = process.env.PRLCTL_BIN || "";
  if (binaryPath) {
    return { available: true, binaryPath };
  }
  const candidates = [
    "/usr/local/bin/prlctl",
    "/opt/homebrew/bin/prlctl",
    "/Applications/Parallels Desktop.app/Contents/MacOS/prlctl",
  ];
  for (const candidate of candidates) {
    if (await commandExists(candidate)) {
      return { available: true, binaryPath: candidate };
    }
  }
  return { available: false as const, binaryPath: undefined };
}

async function runParallelsScript(params: {
  repoRoot: string;
  logPath: string;
  scriptPath: string;
  mode: KovaParallelsMode;
  provider: KovaParallelsProvider;
}) {
  const env = { ...process.env };
  const child = spawn(
    "/bin/bash",
    [params.scriptPath, "--mode", params.mode, "--provider", params.provider, "--json"],
    {
      cwd: params.repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const logStream = createWriteStream(params.logPath, { flags: "a" });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  await new Promise<void>((resolve) => {
    logStream.end(resolve);
  });

  return exitCode;
}

async function extractParallelsRunDir(logPath: string) {
  const content = await fs.readFile(logPath, "utf8");
  const lines = content.split(/\r?\n/);
  const match = [...lines]
    .toReversed()
    .map((line) => /^==> Run logs:\s+(.+)$/.exec(line))
    .find(Boolean);
  return match?.[1];
}

function createParallelsBaseArtifact(params: {
  selection: KovaBackendRunSelection;
  guest: KovaParallelsGuest;
  mode: KovaParallelsMode;
  provider: KovaParallelsProvider;
  gitCommit?: string;
  gitDirty: boolean;
}): Pick<
  KovaRunArtifact,
  "schemaVersion" | "runId" | "selection" | "scenario" | "backend" | "environment" | "coverage"
> {
  const backend = readKovaBackend("parallels");
  if (!backend) {
    throw new Error("Kova backend metadata missing for parallels");
  }
  return {
    schemaVersion: 1,
    runId: params.selection.runId,
    selection: {
      command: "run",
      target: "parallels",
      suite: "parallels-smoke",
      scenarioMode: "all",
      axes: {
        guest: params.guest,
        mode: params.mode,
        provider: params.provider,
      },
    },
    scenario: {
      id: "parallels",
      title: "Parallels smoke",
      category: "platform",
      capabilities: ["lane.parallels", "platform.compatibility"],
    },
    backend: {
      id: backend.id,
      title: backend.title,
      kind: backend.kind,
      runner: backend.runner,
      binary: backend.binary,
    },
    environment: {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      gitCommit: params.gitCommit,
      gitDirty: params.gitDirty,
    },
    coverage: buildParallelsBaseCoverage({
      guest: params.guest,
      mode: params.mode,
    }),
  };
}

export const parallelsBackend: KovaBackend = {
  id: "parallels",
  title: "Parallels guest VM",
  kind: "parallels",
  runner: "vm",
  binary: "prlctl",
  supportsTarget(target): target is "parallels" {
    return target === "parallels";
  },
  async run(selection) {
    const { guest, mode, provider } = resolveParallelsAxes(selection);
    const startedAt = new Date();
    const runDir = resolveKovaRunDir(selection.repoRoot, selection.runId);
    await ensureDir(runDir);

    const hostLogPath = path.join(runDir, "parallels-host.log");
    await writeTextFile(hostLogPath, `# Kova Parallels host log\nrunId=${selection.runId}\n\n`);

    const [gitCommit, gitDirty] = await Promise.all([
      resolveGitCommit(selection.repoRoot),
      resolveGitDirty(selection.repoRoot),
    ]);
    const baseArtifact = createParallelsBaseArtifact({
      selection,
      guest,
      mode,
      provider,
      gitCommit,
      gitDirty,
    });
    const evidencePaths = [runDir, hostLogPath, path.join(runDir, "run.json")];

    const availability = await resolveParallelsAvailability();
    if (!availability.available || !availability.binaryPath) {
      const finishedAt = new Date();
      const artifact = kovaRunArtifactSchema.parse({
        ...baseArtifact,
        status: "infra_failed",
        verdict: "blocked",
        classification: {
          domain: "backend",
          reason: "Parallels CLI is not available on this host.",
        },
        timing: {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
        counts: { total: 0, passed: 0, failed: 0 },
        execution: {
          state: "blocked",
          availability: "missing",
          cleanup: {
            status: "not_needed",
          },
          paths: {
            artifactRoot: runDir,
            logPath: hostLogPath,
          },
        },
        scenarioResults: [],
        evidence: {
          sourceArtifactPaths: evidencePaths,
        },
        notes: ["backend=parallels"],
      });
      await writeJsonFile(path.join(runDir, "run.json"), artifact);
      await updateKovaRunIndex(selection.repoRoot, artifact);
      return artifact;
    }

    const providerEnvVar = parallelsProviderEnvVar[provider];
    if (!process.env[providerEnvVar]) {
      const finishedAt = new Date();
      const artifact = kovaRunArtifactSchema.parse({
        ...baseArtifact,
        status: "infra_failed",
        verdict: "blocked",
        classification: {
          domain: "environment",
          reason: `${providerEnvVar} is required for the Parallels ${provider} lane.`,
        },
        timing: {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
        counts: { total: 0, passed: 0, failed: 0 },
        execution: {
          state: "blocked",
          availability: "available",
          binaryPath: availability.binaryPath,
          cleanup: {
            status: "not_needed",
          },
          paths: {
            artifactRoot: runDir,
            logPath: hostLogPath,
          },
        },
        scenarioResults: [],
        evidence: {
          sourceArtifactPaths: evidencePaths,
        },
        notes: ["backend=parallels"],
      });
      await writeJsonFile(path.join(runDir, "run.json"), artifact);
      await updateKovaRunIndex(selection.repoRoot, artifact);
      return artifact;
    }

    const scriptPath = path.join(selection.repoRoot, parallelsScriptByGuest[guest]);
    const exitCode = await runParallelsScript({
      repoRoot: selection.repoRoot,
      logPath: hostLogPath,
      scriptPath,
      mode,
      provider,
    });

    const externalRunDir = await extractParallelsRunDir(hostLogPath);
    if (!externalRunDir) {
      const finishedAt = new Date();
      const artifact = kovaRunArtifactSchema.parse({
        ...baseArtifact,
        status: "infra_failed",
        verdict: "blocked",
        classification: {
          domain: "backend",
          reason: "Parallels smoke run did not expose a run directory.",
        },
        timing: {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
        counts: { total: 0, passed: 0, failed: 0 },
        execution: {
          state: "failed",
          availability: "available",
          binaryPath: availability.binaryPath,
          cleanup: {
            status: "unknown",
          },
          paths: {
            artifactRoot: runDir,
            logPath: hostLogPath,
          },
        },
        scenarioResults: [],
        evidence: {
          sourceArtifactPaths: evidencePaths,
        },
        notes: ["backend=parallels", `exitCode=${exitCode}`],
      });
      await writeJsonFile(path.join(runDir, "run.json"), artifact);
      await updateKovaRunIndex(selection.repoRoot, artifact);
      return artifact;
    }

    const summaryPath = path.join(externalRunDir, "summary.json");
    const summary = parallelsSummarySchema.parse(
      JSON.parse(await fs.readFile(summaryPath, "utf8")),
    );
    const scenarioResults = buildParallelsScenarioResults({
      summary,
      guest,
    });
    const counts = buildParallelsCounts(scenarioResults);
    const finishedAt = new Date();
    const artifact = kovaRunArtifactSchema.parse({
      ...baseArtifact,
      status: "completed",
      verdict: deriveParallelsVerdict(counts.failed),
      classification: deriveParallelsClassification(counts.failed),
      timing: {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
      counts,
      coverage: buildParallelsCoverage(scenarioResults),
      execution: {
        state: exitCode === 0 ? "executed" : "failed",
        availability: "available",
        binaryPath: availability.binaryPath,
        instanceId: summary.vm,
        cleanup: {
          status: "unknown",
        },
        paths: {
          artifactRoot: externalRunDir,
          logPath: hostLogPath,
        },
      },
      scenarioResults,
      evidence: {
        summaryPath,
        sourceArtifactPaths: [...evidencePaths, externalRunDir, summaryPath],
      },
      notes: [
        "backend=parallels",
        ...(summary.snapshotHint ? [`snapshotHint=${summary.snapshotHint}`] : []),
        ...(summary.snapshotId ? [`snapshotId=${summary.snapshotId}`] : []),
        ...(summary.currentHead ? [`currentHead=${summary.currentHead}`] : []),
      ],
    });
    await writeJsonFile(path.join(runDir, "run.json"), artifact);
    await updateKovaRunIndex(selection.repoRoot, artifact);
    return artifact;
  },
};
