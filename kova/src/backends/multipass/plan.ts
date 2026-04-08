import type { KovaBackendRunSelection } from "../types.js";
import { resolvePnpmVersion } from "./bootstrap.js";
import {
  MULTIPASS_IMAGE,
  MULTIPASS_MOUNTED_REPO_PATH,
  multipassDefaultResourceProfile,
} from "./defaults.js";

export type KovaMultipassPlan = {
  version: 1;
  runId: string;
  vmName: string;
  image: string;
  cpus: number;
  memory: string;
  disk: string;
  hostRepoPath: string;
  hostGuestScriptPath: string;
  guestMountedRepoPath: string;
  guestRepoPath: string;
  guestArtifactsPath: string;
  guestScriptPath: string;
  guestBootstrapLogPath: string;
  providerMode: "mock-openai" | "live-frontier";
  pnpmVersion: string;
  scenarioIds: string[];
  hostCommands: string[];
  qaCommand: string[];
};

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

function buildGuestRepoPath(vmName: string) {
  return `/home/ubuntu/${vmName}/repo`;
}

export function buildMultipassPlan(
  selection: KovaBackendRunSelection,
  hostGuestScriptPath: string,
): KovaMultipassPlan {
  const vmName = buildVmName(selection.runId);
  const guestRepoPath = buildGuestRepoPath(vmName);
  const guestArtifactsPath = `${MULTIPASS_MOUNTED_REPO_PATH}/.artifacts/kova/runs/${selection.runId}/qa`;
  const guestScriptPath = `/tmp/${vmName}-qa-suite.sh`;
  const guestBootstrapLogPath = `/tmp/${vmName}-bootstrap.log`;
  const qaCommand = buildQaCommand(selection, guestArtifactsPath);
  const pnpmVersion = resolvePnpmVersion(selection.repoRoot);
  return {
    version: 1,
    runId: selection.runId,
    vmName,
    image: MULTIPASS_IMAGE,
    cpus: multipassDefaultResourceProfile.cpus,
    memory: multipassDefaultResourceProfile.memory,
    disk: multipassDefaultResourceProfile.disk,
    hostRepoPath: selection.repoRoot,
    hostGuestScriptPath,
    guestMountedRepoPath: MULTIPASS_MOUNTED_REPO_PATH,
    guestRepoPath,
    guestArtifactsPath,
    guestScriptPath,
    guestBootstrapLogPath,
    providerMode: selection.providerMode ?? "mock-openai",
    pnpmVersion,
    scenarioIds: selection.scenarioIds ?? [],
    hostCommands: [
      `multipass launch --name ${shellQuote(vmName)} --cpus ${multipassDefaultResourceProfile.cpus} --memory ${shellQuote(multipassDefaultResourceProfile.memory)} --disk ${shellQuote(multipassDefaultResourceProfile.disk)} ${shellQuote(MULTIPASS_IMAGE)}`,
      `multipass mount ${shellQuote(selection.repoRoot)} ${shellQuote(`${vmName}:${MULTIPASS_MOUNTED_REPO_PATH}`)}`,
      `multipass transfer ${shellQuote(hostGuestScriptPath)} ${shellQuote(`${vmName}:${guestScriptPath}`)}`,
      `multipass exec ${shellQuote(vmName)} -- chmod +x ${shellQuote(guestScriptPath)}`,
      `multipass exec ${shellQuote(vmName)} -- ${shellQuote(guestScriptPath)}`,
      `multipass delete --purge ${shellQuote(vmName)}`,
    ],
    qaCommand,
  };
}
