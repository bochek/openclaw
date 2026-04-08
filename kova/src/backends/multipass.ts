import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { kovaRunArtifactSchema } from "../contracts/run-artifact.js";
import { ensureDir, resolveKovaRunDir, writeJsonFile, writeTextFile } from "../lib/fs.js";
import { resolveGitCommit, resolveGitDirty } from "../lib/git.js";
import { updateKovaRunIndex } from "../lib/run-index.js";
import type { KovaBackend, KovaBackendRunSelection } from "./types.js";

type KovaMultipassPlan = {
  version: 1;
  runId: string;
  vmName: string;
  image: string;
  hostRepoPath: string;
  hostGuestScriptPath: string;
  guestRepoPath: string;
  guestArtifactsPath: string;
  guestScriptPath: string;
  providerMode: "mock-openai" | "live-frontier";
  scenarioIds: string[];
  hostCommands: string[];
  qaCommand: string[];
};

const MULTIPASS_GUEST_REPO_PATH = "/workspace/openclaw";
const MULTIPASS_IMAGE = "lts";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function buildVmName(runId: string) {
  const suffix = runId
    .replace(/^kova_/, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();
  return `kova-${suffix}`.slice(0, 48);
}

async function hasExecutable(binaryPath: string) {
  try {
    await access(binaryPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveMultipassAvailability() {
  const candidates = [
    "/opt/homebrew/bin/multipass",
    "/usr/local/bin/multipass",
    "/snap/bin/multipass",
    "/usr/bin/multipass",
  ];
  for (const candidate of candidates) {
    if (await hasExecutable(candidate)) {
      return {
        available: true as const,
        binaryPath: candidate,
      };
    }
  }
  return {
    available: false as const,
    binaryPath: null,
  };
}

function buildQaCommand(selection: KovaBackendRunSelection, guestArtifactsPath: string) {
  const command = [
    "pnpm",
    "openclaw",
    "qa",
    "suite",
    "--output-dir",
    guestArtifactsPath,
    "--provider-mode",
    selection.providerMode ?? "mock-openai",
  ];
  for (const scenarioId of selection.scenarioIds ?? []) {
    command.push("--scenario", scenarioId);
  }
  return command;
}

function renderGuestRunScript(plan: KovaMultipassPlan) {
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'command -v node >/dev/null || { echo "missing node in guest" >&2; exit 1; }',
    'command -v pnpm >/dev/null || { echo "missing pnpm in guest" >&2; exit 1; }',
    "",
    `cd ${shellQuote(plan.guestRepoPath)}`,
    "pnpm install --frozen-lockfile",
    plan.qaCommand.map(shellQuote).join(" "),
    "",
  ];
  return lines.join("\n");
}

function buildMultipassPlan(
  selection: KovaBackendRunSelection,
  hostGuestScriptPath: string,
): KovaMultipassPlan {
  const vmName = buildVmName(selection.runId);
  const guestArtifactsPath = `.artifacts/kova/runs/${selection.runId}/qa`;
  const guestScriptPath = `/tmp/${vmName}-qa-suite.sh`;
  const qaCommand = buildQaCommand(selection, guestArtifactsPath);
  return {
    version: 1,
    runId: selection.runId,
    vmName,
    image: MULTIPASS_IMAGE,
    hostRepoPath: selection.repoRoot,
    hostGuestScriptPath,
    guestRepoPath: MULTIPASS_GUEST_REPO_PATH,
    guestArtifactsPath,
    guestScriptPath,
    providerMode: selection.providerMode ?? "mock-openai",
    scenarioIds: selection.scenarioIds ?? [],
    hostCommands: [
      `multipass launch --name ${shellQuote(vmName)} ${shellQuote(MULTIPASS_IMAGE)}`,
      `multipass mount ${shellQuote(selection.repoRoot)} ${shellQuote(`${vmName}:${MULTIPASS_GUEST_REPO_PATH}`)}`,
      `multipass transfer ${shellQuote(hostGuestScriptPath)} ${shellQuote(`${vmName}:${guestScriptPath}`)}`,
      `multipass exec ${shellQuote(vmName)} -- chmod +x ${shellQuote(guestScriptPath)}`,
      `multipass exec ${shellQuote(vmName)} -- ${shellQuote(guestScriptPath)}`,
      `multipass delete --purge ${shellQuote(vmName)}`,
    ],
    qaCommand,
  };
}

export const multipassBackend: KovaBackend = {
  id: "multipass",
  title: "Multipass VM",
  supportsTarget(target): target is "qa" {
    return target === "qa";
  },
  async run(selection) {
    const startedAt = new Date();
    const runDir = resolveKovaRunDir(selection.repoRoot, selection.runId);
    await ensureDir(runDir);

    const guestScriptPath = path.join(runDir, "multipass-guest-run.sh");
    const plan = buildMultipassPlan(selection, guestScriptPath);
    const planPath = path.join(runDir, "multipass-plan.json");
    await writeTextFile(guestScriptPath, renderGuestRunScript(plan));
    await writeJsonFile(planPath, plan);

    const availability = await resolveMultipassAvailability();
    const finishedAt = new Date();
    const reason = availability.available
      ? `multipass backend execution is not wired yet; generated plan artifacts in ${runDir}`
      : `multipass CLI not found on host; generated plan artifacts in ${runDir}`;
    const artifact = kovaRunArtifactSchema.parse({
      schemaVersion: 1,
      runId: selection.runId,
      selection: {
        command: "run",
        target: selection.target,
        scenarioIds:
          selection.scenarioIds && selection.scenarioIds.length > 0
            ? selection.scenarioIds
            : undefined,
      },
      scenario: {
        id: selection.target,
        title: "QA suite",
        category: "behavior",
        capabilities: ["behavior", "qa"],
      },
      backend: {
        kind: "multipass",
        mode: selection.providerMode ?? "mock-openai",
      },
      environment: {
        os: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        gitCommit: await resolveGitCommit(selection.repoRoot),
        gitDirty: await resolveGitDirty(selection.repoRoot),
      },
      status: "infra_failed",
      verdict: "blocked",
      classification: {
        domain: "backend",
        reason,
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
      scenarioResults: [],
      evidence: {
        sourceArtifactPaths: [runDir, planPath, guestScriptPath, path.join(runDir, "run.json")],
      },
      notes: [
        "backend=multipass",
        `state=${availability.available ? "planned" : "missing-cli"}`,
        `vmName=${plan.vmName}`,
        `guestRepoPath=${plan.guestRepoPath}`,
        `guestScriptPath=${plan.guestScriptPath}`,
        `availability=${availability.binaryPath ?? "missing"}`,
      ],
    });
    await writeJsonFile(path.join(runDir, "run.json"), artifact);
    await updateKovaRunIndex(selection.repoRoot, artifact);
    return artifact;
  },
};
