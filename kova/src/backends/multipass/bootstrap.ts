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
  "xz-utils",
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
    "  local node_arch",
    '  case "$(uname -m)" in',
    '    x86_64) node_arch="x64" ;;',
    '    aarch64|arm64) node_arch="arm64" ;;',
    '    *) echo "unsupported guest architecture for node bootstrap: $(uname -m)" >&2; return 1 ;;',
    "  esac",
    "  local node_tmp_dir tarball_name extract_dir base_url",
    '  node_tmp_dir="$(mktemp -d)"',
    "  trap 'rm -rf \"${node_tmp_dir}\"' RETURN",
    '  base_url="https://nodejs.org/dist/latest-v22.x"',
    '  curl -fsSL "${base_url}/SHASUMS256.txt" -o "${node_tmp_dir}/SHASUMS256.txt" >>"$BOOTSTRAP_LOG" 2>&1',
    '  tarball_name="$(awk \'/linux-\'"${node_arch}"\'\\.tar\\.xz$/ { print $2; exit }\' "${node_tmp_dir}/SHASUMS256.txt")"',
    '  [ -n "${tarball_name}" ] || { echo "unable to resolve node tarball for ${node_arch}" >&2; return 1; }',
    '  curl -fsSL "${base_url}/${tarball_name}" -o "${node_tmp_dir}/${tarball_name}" >>"$BOOTSTRAP_LOG" 2>&1',
    '  (cd "${node_tmp_dir}" && grep " ${tarball_name}$" SHASUMS256.txt | sha256sum -c -) >>"$BOOTSTRAP_LOG" 2>&1',
    '  extract_dir="${tarball_name%.tar.xz}"',
    '  sudo mkdir -p /usr/local/lib/nodejs >>"$BOOTSTRAP_LOG" 2>&1',
    '  sudo rm -rf "/usr/local/lib/nodejs/${extract_dir}" >>"$BOOTSTRAP_LOG" 2>&1',
    '  sudo tar -xJf "${node_tmp_dir}/${tarball_name}" -C /usr/local/lib/nodejs >>"$BOOTSTRAP_LOG" 2>&1',
    '  sudo ln -sf "/usr/local/lib/nodejs/${extract_dir}/bin/node" /usr/local/bin/node >>"$BOOTSTRAP_LOG" 2>&1',
    '  sudo ln -sf "/usr/local/lib/nodejs/${extract_dir}/bin/npm" /usr/local/bin/npm >>"$BOOTSTRAP_LOG" 2>&1',
    '  sudo ln -sf "/usr/local/lib/nodejs/${extract_dir}/bin/npx" /usr/local/bin/npx >>"$BOOTSTRAP_LOG" 2>&1',
    '  sudo ln -sf "/usr/local/lib/nodejs/${extract_dir}/bin/corepack" /usr/local/bin/corepack >>"$BOOTSTRAP_LOG" 2>&1',
    "}",
    "",
    "ensure_pnpm() {",
    '  sudo env PATH="/usr/local/bin:/usr/bin:/bin" corepack enable >>"$BOOTSTRAP_LOG" 2>&1',
    `  sudo env PATH="/usr/local/bin:/usr/bin:/bin" corepack prepare pnpm@${plan.pnpmVersion} --activate >>"$BOOTSTRAP_LOG" 2>&1`,
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
