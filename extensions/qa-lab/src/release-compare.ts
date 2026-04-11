import { execFile, spawn } from "node:child_process";
import { access, lstat, mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { resolveRepoRelativeOutputDir } from "./cli-paths.js";

const execFileAsync = promisify(execFile);

const DEFAULT_RELEASE_COMPARE_TIMEOUT_MS = 20_000;
const QA_RELEASE_COMPARE_CLASSIFICATIONS = new Set<QaReleaseCompareClassification>([
  "ok",
  "packaged_entry_missing",
  "plugin_validation_error",
  "load_error",
  "command_missing",
  "timeout",
  "error",
]);

type QaReleaseCompareScenarioId = "bundled-channels";

type QaReleaseCompareCommandSpec = {
  id: string;
  args: string[];
};

type QaReleaseCompareClassification =
  | "ok"
  | "packaged_entry_missing"
  | "plugin_validation_error"
  | "load_error"
  | "command_missing"
  | "timeout"
  | "error";

type QaReleaseCompareDiffKind = "same" | "improved" | "regressed" | "changed";

type QaReleaseCompareCommandResult = {
  id: string;
  argv: string[];
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  classification: QaReleaseCompareClassification;
  summary: string;
};

type QaReleaseCompareInstall = {
  label: "old" | "new";
  requestedRef: string;
  installRef: string;
  versionText: string;
  prefixDir: string;
  homeDir: string;
  binPath: string;
  commandResults: QaReleaseCompareCommandResult[];
};

export type QaReleaseCompareParams = {
  repoRoot: string;
  oldRef: string;
  newRef: string;
  scenarioId?: QaReleaseCompareScenarioId;
  outputDir?: string;
  keepTemp?: boolean;
  timeoutMs?: number;
  allowUnsafeInstallRef?: boolean;
};

export type QaReleaseCompareResult = {
  outputDir: string;
  reportPath: string;
  summaryPath: string;
  scenarioId: QaReleaseCompareScenarioId;
  oldInstall: Omit<QaReleaseCompareInstall, "commandResults"> & {
    commandResults: QaReleaseCompareCommandResult[];
  };
  newInstall: Omit<QaReleaseCompareInstall, "commandResults"> & {
    commandResults: QaReleaseCompareCommandResult[];
  };
  diff: Array<{
    id: string;
    diffKind: QaReleaseCompareDiffKind;
    old: QaReleaseCompareCommandResult;
    new: QaReleaseCompareCommandResult;
  }>;
};

export type QaReleaseSmokeResult = {
  outputDir: string;
  reportPath: string;
  summaryPath: string;
  scenarioId: QaReleaseCompareScenarioId;
  classification: QaReleaseCompareClassification;
  install: QaReleaseCompareInstall;
};

function sanitizeSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type PersistedQaReleaseCompareCommandResult = Omit<
  QaReleaseCompareCommandResult,
  "stdout" | "stderr"
>;

type PersistedQaReleaseCompareInstall = Pick<
  QaReleaseCompareInstall,
  "label" | "requestedRef" | "versionText"
> & {
  installRef?: string;
  commandResults: PersistedQaReleaseCompareCommandResult[];
};

export type PersistedQaReleaseSmokeResult = Omit<QaReleaseSmokeResult, "install"> & {
  install: PersistedQaReleaseCompareInstall;
};

export type PersistedQaReleaseCompareResult = Omit<
  QaReleaseCompareResult,
  "oldInstall" | "newInstall" | "diff"
> & {
  oldInstall: PersistedQaReleaseCompareInstall;
  newInstall: PersistedQaReleaseCompareInstall;
  diff: Array<{
    id: string;
    diffKind: QaReleaseCompareDiffKind;
    old: PersistedQaReleaseCompareCommandResult;
    new: PersistedQaReleaseCompareCommandResult;
  }>;
};

function buildInstallCommandEnv(homeDir: string) {
  return {
    HOME: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, ".config"),
    XDG_CACHE_HOME: path.join(homeDir, ".cache"),
    XDG_DATA_HOME: path.join(homeDir, ".local", "share"),
    npm_config_userconfig: path.join(homeDir, ".npmrc"),
    npm_config_cache: path.join(homeDir, ".npm-cache"),
    npm_config_ignore_scripts: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
  };
}

export function redactPersistedCommandText(text: string) {
  return text
    .replace(/(Authorization:\s*Bearer\s+)[^\s\r\n]+/gi, "$1<REDACTED>")
    .replace(
      /((?:^|[\s"'`])(?:[A-Z0-9_]*?(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|REFRESH_TOKEN))\s*[=:]\s*)[^\s\r\n"'`]+/gm,
      "$1<REDACTED>",
    )
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "<REDACTED>")
    .replace(/\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "<REDACTED>");
}

function isRepoContainedPath(candidatePath: string, repoRoot: string) {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedRoot = path.resolve(repoRoot);
  return (
    resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

function buildRuntimeCommandEnv(homeDir: string, repoRoot: string) {
  const nodeDir = path.dirname(process.execPath);
  const safePathEntries = Array.from(
    new Set(
      [nodeDir, ...(process.env.PATH ?? "").split(path.delimiter)].filter((entry) => {
        if (!entry) {
          return false;
        }
        return !isRepoContainedPath(entry, repoRoot) && !isRepoContainedPath(entry, process.cwd());
      }),
    ),
  );
  return {
    PATH: safePathEntries.join(path.delimiter),
    HOME: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, ".config"),
    XDG_CACHE_HOME: path.join(homeDir, ".cache"),
    XDG_DATA_HOME: path.join(homeDir, ".local", "share"),
    TMPDIR: process.env.TMPDIR ?? "",
    TMP: process.env.TMP ?? "",
    TEMP: process.env.TEMP ?? "",
    TERM: process.env.TERM ?? "",
    LANG: process.env.LANG ?? "",
    LC_ALL: process.env.LC_ALL ?? "",
    LC_CTYPE: process.env.LC_CTYPE ?? "",
    CI: process.env.CI ?? "",
    NO_COLOR: process.env.NO_COLOR ?? "",
    OPENCLAW_HOME: homeDir,
  };
}

function toSafeDisplayRef(requestedRef: string) {
  return isSafeRegistryInstallRef(requestedRef) ? requestedRef : "<local-ref>";
}

function scenarioCommands(scenarioId: QaReleaseCompareScenarioId): QaReleaseCompareCommandSpec[] {
  switch (scenarioId) {
    case "bundled-channels":
      return [
        { id: "plugins-smoke-json", args: ["plugins", "smoke", "--json"] },
        { id: "doctor", args: ["doctor", "--non-interactive"] },
        { id: "status", args: ["status"] },
        { id: "models-status", args: ["models", "status"] },
      ];
  }
  throw new Error(`Unknown QA release scenario: ${String(scenarioId)}`);
}

function buildScenarioConfig(basePort: number) {
  return {
    gateway: {
      port: basePort,
    },
    plugins: {
      entries: {
        telegram: { enabled: true },
        slack: { enabled: true },
        matrix: { enabled: true },
      },
    },
  };
}

function summarizeClassification(
  classification: QaReleaseCompareClassification,
  combinedOutput: string,
): string {
  switch (classification) {
    case "ok":
      return "command succeeded";
    case "packaged_entry_missing": {
      const match = combinedOutput.match(
        /dist\/extensions\/[^\s)]+(?:src\/[^\s)]+|setup-entry\.js[^\n]*)/i,
      );
      return match ? `missing packaged entry: ${match[0]}` : "missing packaged entry";
    }
    case "plugin_validation_error":
      return "plugin validation or register/activate failure";
    case "load_error":
      return "plugin load failed";
    case "command_missing":
      return "command missing in this release";
    case "timeout":
      return "command timed out";
    case "error":
      return "command failed";
  }
  return "command failed";
}

export function classifyReleaseCompareCommandOutput(
  commandId: string,
  stdout: string,
  stderr: string,
  exitCode: number,
  timedOut: boolean,
): QaReleaseCompareClassification {
  if (timedOut) {
    return "timeout";
  }
  const combined = `${stdout}\n${stderr}`;
  if (commandId === "plugins-smoke-json") {
    try {
      const parsed = JSON.parse(stdout) as {
        classification?: string;
      };
      if (
        parsed.classification &&
        QA_RELEASE_COMPARE_CLASSIFICATIONS.has(
          parsed.classification as QaReleaseCompareClassification,
        )
      ) {
        return parsed.classification as QaReleaseCompareClassification;
      }
    } catch {
      // fall through to text heuristics
    }
  }
  if (
    /bundled plugin entry .* failed to open/i.test(combined) ||
    /ENOENT: no such file or directory/i.test(combined)
  ) {
    return "packaged_entry_missing";
  }
  if (
    /missing register\/activate export/i.test(combined) ||
    /plugin load failed:/i.test(combined)
  ) {
    return "plugin_validation_error";
  }
  if (/unknown command/i.test(combined)) {
    return "command_missing";
  }
  if (exitCode === 0) {
    return "ok";
  }
  return "error";
}

export function compareReleaseCompareResults(
  oldResult: QaReleaseCompareCommandResult,
  newResult: QaReleaseCompareCommandResult,
): QaReleaseCompareDiffKind {
  if (
    oldResult.exitCode === newResult.exitCode &&
    oldResult.classification === newResult.classification &&
    oldResult.summary === newResult.summary
  ) {
    return "same";
  }
  if (oldResult.classification !== "ok" && newResult.classification === "ok") {
    return "improved";
  }
  if (oldResult.classification === "ok" && newResult.classification !== "ok") {
    return "regressed";
  }
  return "changed";
}

async function resolveTrustedNpmCliPath() {
  const nodeDir = path.dirname(process.execPath);
  const nodeRoot = path.dirname(nodeDir);
  const candidates = [
    path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(nodeRoot, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(nodeRoot, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(nodeDir, "..", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error("Unable to locate a trusted npm CLI near the current Node installation.");
}

async function installRelease(prefixDir: string, installRef: string, cwd: string, homeDir: string) {
  const npmCliPath = await resolveTrustedNpmCliPath();
  await execFileAsync(
    process.execPath,
    [
      npmCliPath,
      "install",
      "-g",
      "--prefix",
      prefixDir,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      installRef,
    ],
    {
      cwd,
      env: buildInstallCommandEnv(homeDir),
      maxBuffer: 1024 * 1024 * 20,
    },
  );
}

function scheduleTempRootCleanup(tempRoot: string) {
  const cleaner = spawn(
    process.execPath,
    [
      "-e",
      "const fs = require('node:fs'); fs.rmSync(process.argv[2], { recursive: true, force: true });",
      tempRoot,
    ],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  cleaner.unref();
}

async function readVersion(binPath: string, homeDir: string, cwd: string) {
  const { stdout } = await execFileAsync(process.execPath, [binPath, "--version"], {
    cwd,
    env: buildRuntimeCommandEnv(homeDir, cwd),
    maxBuffer: 1024 * 1024 * 2,
  });
  return stdout.trim();
}

async function writeScenarioConfigFile(homeDir: string, config: object) {
  const configDir = path.join(homeDir, ".openclaw");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    path.join(configDir, "openclaw.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

async function resolveRepoContainedTarballPath(repoRoot: string, ref: string) {
  const resolved = path.resolve(repoRoot, ref);
  const stat = await lstat(resolved);
  if (stat.isSymbolicLink()) {
    throw new Error("Unsafe install ref tarball cannot be a symlink.");
  }
  const canonical = await import("node:fs/promises").then(({ realpath }) => realpath(resolved));
  const relative = path.relative(path.resolve(repoRoot), canonical);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Unsafe install ref tarballs must stay within the repo root.");
  }
  return canonical;
}

async function resolveInstallRef(ref: string, repoRoot: string, allowUnsafeInstallRef = false) {
  if (ref === "current-checkout") {
    return repoRoot;
  }
  if (isSafeRegistryInstallRef(ref)) {
    return `openclaw@${ref}`;
  }
  if (!allowUnsafeInstallRef) {
    throw new Error(
      "Unsafe install ref blocked. Use a published version/dist-tag, `current-checkout`, or pass --allow-unsafe-install-ref.",
    );
  }
  if (ref.endsWith(".tgz")) {
    return resolveRepoContainedTarballPath(repoRoot, ref);
  }
  throw new Error(
    "Unsafe install ref only supports repo-contained local .tgz files. Use `current-checkout` for the working tree or a published version/dist-tag for registry installs.",
  );
}

async function runReleaseCommand(params: {
  binPath: string;
  homeDir: string;
  cwd: string;
  command: QaReleaseCompareCommandSpec;
  timeoutMs: number;
}) {
  let exitCode = 0;
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  try {
    const result = await execFileAsync(process.execPath, [params.binPath, ...params.command.args], {
      cwd: params.cwd,
      env: buildRuntimeCommandEnv(params.homeDir, params.cwd),
      timeout: params.timeoutMs,
      maxBuffer: 1024 * 1024 * 8,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: NodeJS.Signals;
    };
    stdout = execError.stdout ?? "";
    stderr = execError.stderr ?? "";
    timedOut = execError.killed === true && execError.signal === "SIGTERM";
    exitCode = typeof execError.code === "number" ? execError.code : 1;
  }
  const classification = classifyReleaseCompareCommandOutput(
    params.command.id,
    stdout,
    stderr,
    exitCode,
    timedOut,
  );
  return {
    id: params.command.id,
    argv: params.command.args,
    exitCode,
    timedOut,
    stdout,
    stderr,
    classification,
    summary: summarizeClassification(classification, `${stdout}\n${stderr}`),
  } satisfies QaReleaseCompareCommandResult;
}

function renderMarkdownReport(result: QaReleaseCompareResult) {
  const mdCode = (value: string) => value.replace(/`/g, "\\`").replace(/\r?\n/g, " ");
  const lines = [
    `# QA Release Compare`,
    ``,
    `- Old: \`${mdCode(toSafeDisplayRef(result.oldInstall.requestedRef))}\` (${result.oldInstall.versionText})`,
    `- New: \`${mdCode(toSafeDisplayRef(result.newInstall.requestedRef))}\` (${result.newInstall.versionText})`,
    `- Scenario: \`${result.scenarioId}\``,
    ``,
    `## Command Diff`,
    ``,
  ];

  for (const diffEntry of result.diff) {
    lines.push(`### ${diffEntry.id}`);
    lines.push(`- Diff: \`${diffEntry.diffKind}\``);
    lines.push(`- Old: \`${diffEntry.old.classification}\` (${diffEntry.old.summary})`);
    lines.push(`- New: \`${diffEntry.new.classification}\` (${diffEntry.new.summary})`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderSmokeMarkdownReport(result: QaReleaseSmokeResult) {
  const mdCode = (value: string) => value.replace(/`/g, "\\`").replace(/\r?\n/g, " ");
  const lines = [
    `# QA Release Smoke`,
    ``,
    `- Ref: \`${mdCode(toSafeDisplayRef(result.install.requestedRef))}\` (${result.install.versionText})`,
    `- Scenario: \`${result.scenarioId}\``,
    `- Classification: \`${result.classification}\``,
    ``,
    `## Commands`,
    ``,
  ];

  for (const commandResult of result.install.commandResults) {
    lines.push(`### ${commandResult.id}`);
    lines.push(`- Classification: \`${commandResult.classification}\``);
    lines.push(`- Summary: ${commandResult.summary}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function writeCommandArtifacts(outputDir: string, install: QaReleaseCompareInstall) {
  const commandsDir = path.join(outputDir, install.label);
  await mkdir(commandsDir, { recursive: true });
  for (const commandResult of install.commandResults) {
    const baseName = sanitizeSegment(commandResult.id) || "command";
    await writeFile(
      path.join(commandsDir, `${baseName}.json`),
      `${JSON.stringify(toPersistedCommandResult(commandResult), null, 2)}\n`,
      "utf8",
    );
  }
}

function isSafeRegistryInstallRef(ref: string) {
  return /^(?:latest|beta|next|canary|stable|v?\d[\w.+-]*)$/i.test(ref);
}

export function resolveQaReleaseOutputDir(params: {
  repoRoot: string;
  outputDir?: string;
  fallbackParts: string[];
}) {
  if (params.outputDir) {
    if (path.isAbsolute(params.outputDir)) {
      const resolvedRepoRoot = path.resolve(params.repoRoot);
      const resolvedOutputDir = path.resolve(params.outputDir);
      const relative = path.relative(resolvedRepoRoot, resolvedOutputDir);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("--output-dir must stay within the repo root.");
      }
      return resolvedOutputDir;
    }
  }
  return (
    resolveRepoRelativeOutputDir(params.repoRoot, params.outputDir) ??
    path.join(params.repoRoot, ...params.fallbackParts)
  );
}

async function createSafeOutputDir(repoRoot: string, outputDir: string) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const resolvedOutputDir = path.resolve(outputDir);
  const relative = path.relative(resolvedRepoRoot, resolvedOutputDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--output-dir must stay within the repo root.");
  }
  let current = resolvedRepoRoot;
  const segments = relative.split(path.sep).filter(Boolean);
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error("--output-dir cannot traverse symlinked paths.");
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        await mkdir(current);
        const createdStat = await lstat(current);
        if (createdStat.isSymbolicLink()) {
          throw new Error("--output-dir cannot traverse symlinked paths.", {
            cause: error,
          });
        }
        continue;
      }
      throw error;
    }
  }
  const [canonicalRoot, canonicalOutput] = await Promise.all([
    realpath(resolvedRepoRoot),
    realpath(resolvedOutputDir),
  ]);
  const canonicalRelative = path.relative(canonicalRoot, canonicalOutput);
  if (canonicalRelative.startsWith("..") || path.isAbsolute(canonicalRelative)) {
    throw new Error("--output-dir must stay within the repo root.");
  }
  return canonicalOutput;
}

export function toPersistedCommandResult(commandResult: QaReleaseCompareCommandResult) {
  const { stdout: _stdout, stderr: _stderr, ...rest } = commandResult;
  return rest satisfies PersistedQaReleaseCompareCommandResult;
}

function toPersistedInstall(install: QaReleaseCompareInstall) {
  const safeInstallRef = isSafeRegistryInstallRef(install.requestedRef)
    ? install.installRef
    : undefined;
  return {
    label: install.label,
    requestedRef: toSafeDisplayRef(install.requestedRef),
    ...(safeInstallRef ? { installRef: safeInstallRef } : {}),
    versionText: install.versionText,
    commandResults: install.commandResults.map(toPersistedCommandResult),
  } satisfies PersistedQaReleaseCompareInstall;
}

export function toPersistedSmokeResult(result: QaReleaseSmokeResult) {
  return {
    ...result,
    install: toPersistedInstall(result.install),
  } satisfies PersistedQaReleaseSmokeResult;
}

export function toPersistedCompareResult(result: QaReleaseCompareResult) {
  return {
    ...result,
    oldInstall: toPersistedInstall(result.oldInstall),
    newInstall: toPersistedInstall(result.newInstall),
    diff: result.diff.map((entry) => ({
      ...entry,
      old: toPersistedCommandResult(entry.old),
      new: toPersistedCommandResult(entry.new),
    })),
  } satisfies PersistedQaReleaseCompareResult;
}

async function createIsolatedInstall(params: {
  tempRoot: string;
  label: "old" | "new";
  requestedRef: string;
  repoRoot: string;
  scenarioId: QaReleaseCompareScenarioId;
  timeoutMs: number;
  basePort: number;
  allowUnsafeInstallRef?: boolean;
}) {
  const prefixDir = path.join(params.tempRoot, `${params.label}-prefix`);
  const homeDir = path.join(params.tempRoot, `${params.label}-home`);
  const installRef = await resolveInstallRef(
    params.requestedRef,
    params.repoRoot,
    params.allowUnsafeInstallRef,
  );

  await mkdir(homeDir, { recursive: true });
  await installRelease(prefixDir, installRef, params.repoRoot, homeDir);

  const binPath = path.join(prefixDir, "lib", "node_modules", "openclaw", "openclaw.mjs");
  await writeScenarioConfigFile(homeDir, buildScenarioConfig(params.basePort));
  const versionText = await readVersion(binPath, homeDir, params.repoRoot);
  const commands = scenarioCommands(params.scenarioId);
  const commandResults = await Promise.all(
    commands.map((command) =>
      runReleaseCommand({
        binPath,
        homeDir,
        cwd: params.repoRoot,
        command,
        timeoutMs: params.timeoutMs,
      }),
    ),
  );

  return {
    label: params.label,
    requestedRef: params.requestedRef,
    installRef,
    versionText,
    prefixDir,
    homeDir,
    binPath,
    commandResults,
  } satisfies QaReleaseCompareInstall;
}

export function summarizeInstallClassification(
  install: Pick<QaReleaseCompareInstall, "commandResults">,
): QaReleaseCompareClassification {
  for (const result of install.commandResults) {
    if (result.classification === "packaged_entry_missing") {
      return "packaged_entry_missing";
    }
  }
  for (const result of install.commandResults) {
    if (result.classification === "load_error") {
      return "load_error";
    }
  }
  for (const result of install.commandResults) {
    if (result.classification === "plugin_validation_error") {
      return "plugin_validation_error";
    }
  }
  for (const result of install.commandResults) {
    if (result.classification === "timeout") {
      return "timeout";
    }
  }
  for (const result of install.commandResults) {
    if (result.classification === "error") {
      return "error";
    }
  }
  for (const result of install.commandResults) {
    if (result.classification === "command_missing" && result.id !== "plugins-smoke-json") {
      return "command_missing";
    }
  }
  return "ok";
}

export type QaReleaseSmokeParams = {
  repoRoot: string;
  ref: string;
  scenarioId?: QaReleaseCompareScenarioId;
  outputDir?: string;
  keepTemp?: boolean;
  timeoutMs?: number;
  allowUnsafeInstallRef?: boolean;
};

export async function runQaReleaseSmoke(
  params: QaReleaseSmokeParams,
): Promise<QaReleaseSmokeResult> {
  const scenarioId = params.scenarioId ?? "bundled-channels";
  scenarioCommands(scenarioId);
  const outputDir = resolveQaReleaseOutputDir({
    repoRoot: params.repoRoot,
    outputDir: params.outputDir,
    fallbackParts: [".artifacts", "qa", "release-smoke", sanitizeSegment(params.ref)],
  });
  const safeOutputDir = await createSafeOutputDir(params.repoRoot, outputDir);

  const tempRoot = await mkdtemp(path.join(tmpdir(), "openclaw-qa-release-smoke-"));
  try {
    const install = await createIsolatedInstall({
      tempRoot,
      label: "new",
      requestedRef: params.ref,
      repoRoot: params.repoRoot,
      scenarioId,
      timeoutMs: params.timeoutMs ?? DEFAULT_RELEASE_COMPARE_TIMEOUT_MS,
      basePort: 20000 + Math.floor(Math.random() * 10000),
      allowUnsafeInstallRef: params.allowUnsafeInstallRef,
    });
    const result: QaReleaseSmokeResult = {
      outputDir: safeOutputDir,
      reportPath: path.join(safeOutputDir, "release-smoke-report.md"),
      summaryPath: path.join(safeOutputDir, "release-smoke-summary.json"),
      scenarioId,
      classification: summarizeInstallClassification(install),
      install,
    };

    await writeCommandArtifacts(safeOutputDir, install);
    await writeFile(result.reportPath, renderSmokeMarkdownReport(result), "utf8");
    await writeFile(
      result.summaryPath,
      `${JSON.stringify(toPersistedSmokeResult(result), null, 2)}\n`,
      "utf8",
    );
    return result;
  } finally {
    if (!params.keepTemp) {
      scheduleTempRootCleanup(tempRoot);
    }
  }
}

export async function runQaReleaseCompare(
  params: QaReleaseCompareParams,
): Promise<QaReleaseCompareResult> {
  const scenarioId = params.scenarioId ?? "bundled-channels";
  scenarioCommands(scenarioId);
  const outputDir = resolveQaReleaseOutputDir({
    repoRoot: params.repoRoot,
    outputDir: params.outputDir,
    fallbackParts: [
      ".artifacts",
      "qa",
      "release-compare",
      `${sanitizeSegment(params.oldRef)}-vs-${sanitizeSegment(params.newRef)}`,
    ],
  });
  const safeOutputDir = await createSafeOutputDir(params.repoRoot, outputDir);

  const tempRoot = await mkdtemp(path.join(tmpdir(), "openclaw-qa-release-compare-"));
  try {
    const basePort = 20000 + Math.floor(Math.random() * 10000);
    const timeoutMs = params.timeoutMs ?? DEFAULT_RELEASE_COMPARE_TIMEOUT_MS;
    const [oldCommandResults, newCommandResults] = await Promise.all([
      createIsolatedInstall({
        tempRoot,
        label: "old",
        requestedRef: params.oldRef,
        repoRoot: params.repoRoot,
        scenarioId,
        timeoutMs,
        basePort,
        allowUnsafeInstallRef: params.allowUnsafeInstallRef,
      }),
      createIsolatedInstall({
        tempRoot,
        label: "new",
        requestedRef: params.newRef,
        repoRoot: params.repoRoot,
        scenarioId,
        timeoutMs,
        basePort: basePort + 1,
        allowUnsafeInstallRef: params.allowUnsafeInstallRef,
      }),
    ]);
    const oldInstall = oldCommandResults;
    const newInstall = newCommandResults;

    const commands = scenarioCommands(scenarioId);
    const diff = commands.map((command, index) => ({
      id: command.id,
      diffKind: compareReleaseCompareResults(
        oldInstall.commandResults[index],
        newInstall.commandResults[index],
      ),
      old: oldInstall.commandResults[index],
      new: newInstall.commandResults[index],
    }));

    const result: QaReleaseCompareResult = {
      outputDir: safeOutputDir,
      reportPath: path.join(safeOutputDir, "release-compare-report.md"),
      summaryPath: path.join(safeOutputDir, "release-compare-summary.json"),
      scenarioId,
      oldInstall,
      newInstall,
      diff,
    };

    await writeCommandArtifacts(safeOutputDir, oldInstall);
    await writeCommandArtifacts(safeOutputDir, newInstall);
    await writeFile(result.reportPath, renderMarkdownReport(result), "utf8");
    await writeFile(
      result.summaryPath,
      `${JSON.stringify(toPersistedCompareResult(result), null, 2)}\n`,
      "utf8",
    );
    return result;
  } finally {
    if (!params.keepTemp) {
      scheduleTempRootCleanup(tempRoot);
    }
  }
}
