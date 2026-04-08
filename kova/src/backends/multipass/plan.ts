import fs from "node:fs";
import path from "node:path";
import type { KovaBackendRunSelection } from "../types.js";

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

const MULTIPASS_MOUNTED_REPO_PATH = "/workspace/openclaw-host";
const MULTIPASS_IMAGE = "lts";
const MULTIPASS_CPUS = 2;
const MULTIPASS_MEMORY = "4G";
const MULTIPASS_DISK = "24G";

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

function resolvePnpmVersion(repoRoot: string) {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    packageManager?: string;
  };
  const packageManager = packageJson.packageManager ?? "";
  const match = /^pnpm@(.+)$/.exec(packageManager);
  if (!match?.[1]) {
    throw new Error(`unable to resolve pnpm version from packageManager in ${packageJsonPath}`);
  }
  return match[1];
}

export function renderGuestRunScript(plan: KovaMultipassPlan) {
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "trap 'status=$?; echo \"guest failure: ${BASH_COMMAND} (exit ${status})\" >&2; exit ${status}' ERR",
    "",
    "export DEBIAN_FRONTEND=noninteractive",
    `BOOTSTRAP_LOG=${shellQuote(plan.guestBootstrapLogPath)}`,
    ': > "$BOOTSTRAP_LOG"',
    "",
    "ensure_guest_packages() {",
    '  sudo -E apt-get update >>"$BOOTSTRAP_LOG" 2>&1',
    "  sudo -E apt-get install -y \\",
    "    build-essential \\",
    "    ca-certificates \\",
    "    curl \\",
    "    pkg-config \\",
    "    python3 \\",
    '    rsync >>"$BOOTSTRAP_LOG" 2>&1',
    "}",
    "",
    "ensure_node() {",
    "  if command -v node >/dev/null; then",
    "    local node_major",
    '    node_major="$(node -p \'process.versions.node.split(".")[0]\' 2>/dev/null || echo 0)"',
    '    if [ "${node_major}" -ge 22 ]; then',
    "      return 0",
    "    fi",
    "  fi",
    '  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >>"$BOOTSTRAP_LOG" 2>&1',
    '  sudo -E apt-get install -y nodejs >>"$BOOTSTRAP_LOG" 2>&1',
    "}",
    "",
    "ensure_pnpm() {",
    `  sudo npm install -g pnpm@${plan.pnpmVersion} >>"$BOOTSTRAP_LOG" 2>&1`,
    "}",
    "",
    'command -v sudo >/dev/null || { echo "missing sudo in guest" >&2; exit 1; }',
    "ensure_guest_packages",
    "ensure_node",
    "ensure_pnpm",
    'command -v node >/dev/null || { echo "missing node after guest bootstrap" >&2; exit 1; }',
    'command -v pnpm >/dev/null || { echo "missing pnpm after guest bootstrap" >&2; exit 1; }',
    'command -v rsync >/dev/null || { echo "missing rsync after guest bootstrap" >&2; exit 1; }',
    "",
    `mkdir -p ${shellQuote(path.posix.dirname(plan.guestRepoPath))}`,
    `rm -rf ${shellQuote(plan.guestRepoPath)}`,
    `mkdir -p ${shellQuote(plan.guestRepoPath)}`,
    `mkdir -p ${shellQuote(path.posix.dirname(plan.guestArtifactsPath))}`,
    [
      "rsync -a --delete",
      "--exclude",
      shellQuote(".git"),
      "--exclude",
      shellQuote("node_modules"),
      "--exclude",
      shellQuote(".artifacts"),
      "--exclude",
      shellQuote(".tmp"),
      "--exclude",
      shellQuote(".turbo"),
      "--exclude",
      shellQuote("coverage"),
      "--exclude",
      shellQuote("*.heapsnapshot"),
      shellQuote(`${plan.guestMountedRepoPath}/`),
      shellQuote(`${plan.guestRepoPath}/`),
    ].join(" "),
    `cd ${shellQuote(plan.guestRepoPath)}`,
    'pnpm install --frozen-lockfile >>"$BOOTSTRAP_LOG" 2>&1',
    plan.qaCommand.map(shellQuote).join(" "),
    "",
  ];
  return lines.join("\n");
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
    cpus: MULTIPASS_CPUS,
    memory: MULTIPASS_MEMORY,
    disk: MULTIPASS_DISK,
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
      `multipass launch --name ${shellQuote(vmName)} --cpus ${MULTIPASS_CPUS} --memory ${shellQuote(MULTIPASS_MEMORY)} --disk ${shellQuote(MULTIPASS_DISK)} ${shellQuote(MULTIPASS_IMAGE)}`,
      `multipass mount ${shellQuote(selection.repoRoot)} ${shellQuote(`${vmName}:${MULTIPASS_MOUNTED_REPO_PATH}`)}`,
      `multipass transfer ${shellQuote(hostGuestScriptPath)} ${shellQuote(`${vmName}:${guestScriptPath}`)}`,
      `multipass exec ${shellQuote(vmName)} -- chmod +x ${shellQuote(guestScriptPath)}`,
      `multipass exec ${shellQuote(vmName)} -- ${shellQuote(guestScriptPath)}`,
      `multipass delete --purge ${shellQuote(vmName)}`,
    ],
    qaCommand,
  };
}
