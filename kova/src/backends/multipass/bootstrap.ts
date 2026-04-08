import fs from "node:fs";
import path from "node:path";
import type { KovaMultipassPlan } from "./plan.js";

const multipassGuestPackages = [
  "build-essential",
  "ca-certificates",
  "curl",
  "pkg-config",
  "python3",
  "rsync",
] as const;

const multipassRepoSyncExcludes = [
  ".git",
  "node_modules",
  ".artifacts",
  ".tmp",
  ".turbo",
  "coverage",
  "*.heapsnapshot",
] as const;

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function resolvePnpmVersion(repoRoot: string) {
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
  const rsyncCommand = [
    "rsync -a --delete",
    ...multipassRepoSyncExcludes.flatMap((value) => ["--exclude", shellQuote(value)]),
    shellQuote(`${plan.guestMountedRepoPath}/`),
    shellQuote(`${plan.guestRepoPath}/`),
  ].join(" ");

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
    ...multipassGuestPackages.map((value, index) =>
      index === multipassGuestPackages.length - 1
        ? `    ${value} >>"$BOOTSTRAP_LOG" 2>&1`
        : `    ${value} \\`,
    ),
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
    rsyncCommand,
    `cd ${shellQuote(plan.guestRepoPath)}`,
    'pnpm install --frozen-lockfile >>"$BOOTSTRAP_LOG" 2>&1',
    plan.qaCommand.map(shellQuote).join(" "),
    "",
  ];
  return lines.join("\n");
}
