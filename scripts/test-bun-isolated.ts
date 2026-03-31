#!/usr/bin/env bun

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { channelTestPrefixes } from "../vitest.channel-paths.mjs";
import { isUnitConfigTestFile, unitTestAdditionalExcludePatterns } from "../vitest.unit-paths.mjs";

type RunResult = {
  durationMs: number;
  engine: "bun" | "vitest-fallback";
  exitCode: number;
  file: string;
  output: string;
};

type PendingFallback = {
  bunResult: RunResult;
  file: string;
  vitestConfig: string;
};

type BunTask = {
  files: string[];
  vitestConfig: string;
};

const repoRoot = process.cwd();
const repoCacheKey = path
  .basename(repoRoot)
  .replaceAll(/[^a-z0-9]+/gi, "-")
  .toLowerCase();
const bunSkipCacheVersion = 2;
const bunSkipCachePath = path.join(os.tmpdir(), `openclaw-bun-skip-${repoCacheKey}.json`);
const args = process.argv.slice(2);
const hasExplicitFileArgs = args.length > 0;
const useBunSkipCache = process.env.OPENCLAW_BUN_SKIP_CACHE === "1";
const directVitestSurfaces = new Set(
  (process.env.OPENCLAW_BUN_DIRECT_VITEST_SURFACES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const maxParallel = Math.max(
  1,
  Math.min(
    Number.parseInt(process.env.OPENCLAW_BUN_MAX_PARALLEL ?? "", 10) ||
      Math.max(1, Math.min(hasExplicitFileArgs ? 4 : 2, os.availableParallelism())),
    8,
  ),
);
const bunBatchSize = Math.max(
  1,
  Number.parseInt(process.env.OPENCLAW_BUN_BATCH_SIZE ?? "", 10) || (hasExplicitFileArgs ? 16 : 4),
);
const vitestFallbackBatchSize = Math.max(
  1,
  Number.parseInt(process.env.OPENCLAW_BUN_VITEST_FALLBACK_BATCH_SIZE ?? "", 10) || 16,
);
const vitestFallbackMinTimeoutMs = Math.max(
  10_000,
  Number.parseInt(process.env.OPENCLAW_BUN_VITEST_FALLBACK_MIN_TIMEOUT_MS ?? "", 10) || 20_000,
);
const bunDirectVitestPatterns = (process.env.OPENCLAW_BUN_DIRECT_VITEST_PATTERNS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const bunAllowlistPatterns = ["src/agents/models-config*.test.ts"];
const bunSerialPatterns = [
  "packages/memory-host-sdk/src/host/**/*.test.ts",
  "src/acp/control-plane/**/*.test.ts",
  "src/acp/server.startup.test.ts",
  "src/acp/translator.cancel-scoping.test.ts",
  "src/acp/translator.prompt-prefix.test.ts",
  "src/acp/translator.session-rate-limit.test.ts",
  "src/acp/translator.set-session-mode.test.ts",
  "src/acp/translator.stop-reason.test.ts",
  "src/agents/models-config*.test.ts",
  "src/agents/acp-*.test.ts",
  "src/agents/anthropic-vertex-stream.test.ts",
  "src/agents/auth-profiles*.test.ts",
  "src/agents/auth-profiles/**/*.test.ts",
  "src/agents/bash-tools*.test.ts",
  "src/agents/pi-embedded-runner/**/*.test.ts",
  "src/agents/pi-tools*.test.ts",
  "src/agents/openclaw-tools.session*.test.ts",
  "src/agents/openclaw-tools.sessions*.test.ts",
  "src/agents/runtime-plugins.test.ts",
  "src/agents/sandbox/**/*.test.ts",
  "src/agents/skills-install*.test.ts",
  "src/agents/skills-status.test.ts",
  "src/agents/tools/sessions.test.ts",
  "src/agents/pi-tool-definition-adapter.after-tool-call*.test.ts",
  "src/agents/pi-tools.whatsapp-login-gating.test.ts",
  "src/agents/subagent-*.test.ts",
  "src/agents/subagent-registry*.test.ts",
  "src/cli/**/*.test.ts",
  "ui/**/*.test.ts",
];
const bunPathRuleBypassPatterns = ["src/agents/**"];
const bunSlowFilePatterns = [
  "packages/memory-host-sdk/src/host/**/*.test.ts",
  "src/acp/control-plane/**/*.test.ts",
  "src/agents/**",
  "src/agents/models-config*.test.ts",
  "src/agents/acp-*.test.ts",
  "src/agents/anthropic-vertex-stream.test.ts",
  "src/agents/auth-profiles*.test.ts",
  "src/agents/auth-profiles/**/*.test.ts",
  "src/gateway/**/*.test.ts",
  "src/cli/**/*.test.ts",
];

const TEST_FILE_RE = /\.test\.(?:[cm]?[jt]sx?)$/;
const IGNORED_PATH_SEGMENTS = [
  "/dist/",
  "/node_modules/",
  "/vendor/",
  "/apps/macos/",
  "/apps/macos/.build/",
  "/dist/OpenClaw.app/",
];

function shouldIncludeFile(file: string): boolean {
  if (!TEST_FILE_RE.test(file)) {
    return false;
  }
  if (file.includes(".live.test.") || file.includes(".e2e.test.")) {
    return false;
  }
  const normalized = `/${file.replaceAll(path.sep, "/")}`;
  return !IGNORED_PATH_SEGMENTS.some((segment) => normalized.includes(segment));
}

function listTestFiles(): string[] {
  const rg = Bun.spawnSync(["rg", "--files"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  if (rg.exitCode !== 0) {
    throw new Error((new TextDecoder().decode(rg.stderr) || "rg --files failed").trim());
  }
  return new TextDecoder()
    .decode(rg.stdout)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(shouldIncludeFile)
    .toSorted((left, right) => left.localeCompare(right));
}

function loadBunSkipCache(): Set<string> {
  if (!useBunSkipCache || !fs.existsSync(bunSkipCachePath)) {
    return new Set<string>();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(bunSkipCachePath, "utf8")) as unknown;
    if (Array.isArray(parsed)) {
      // Ignore legacy cache payloads that were populated by batch timeout fallout.
      return new Set<string>();
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      !("files" in parsed) ||
      (parsed as { version?: unknown }).version !== bunSkipCacheVersion ||
      !Array.isArray((parsed as { files?: unknown }).files)
    ) {
      return new Set<string>();
    }
    return new Set(
      (parsed as { files: unknown[] }).files.filter(
        (value): value is string => typeof value === "string",
      ),
    );
  } catch {
    return new Set<string>();
  }
}

function saveBunSkipCache(filesToSkip: ReadonlySet<string>): void {
  if (!useBunSkipCache) {
    return;
  }
  fs.writeFileSync(
    bunSkipCachePath,
    `${JSON.stringify(
      {
        version: bunSkipCacheVersion,
        files: [...filesToSkip].toSorted((left, right) => left.localeCompare(right)),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function resolveRequestedFiles(allFiles: string[], requested: string[]): string[] {
  if (requested.length === 0) {
    return allFiles;
  }
  const resolved = new Set<string>();
  for (const request of requested) {
    const normalizedRequest = request.replaceAll(path.sep, "/");
    if (allFiles.includes(normalizedRequest)) {
      resolved.add(normalizedRequest);
      continue;
    }
    for (const file of allFiles) {
      if (file.includes(normalizedRequest)) {
        resolved.add(file);
      }
    }
  }
  return [...resolved].toSorted((left, right) => left.localeCompare(right));
}

async function runCommand(params: {
  argv: string[];
  engine: RunResult["engine"];
  env?: NodeJS.ProcessEnv;
  file: string;
  timeoutMs?: number;
}): Promise<RunResult> {
  const startedAt = performance.now();
  const proc = Bun.spawn(params.argv, {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: params.env ?? process.env,
  });
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  let timedOut = false;
  const timeoutId =
    params.timeoutMs === undefined
      ? null
      : setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, params.timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  return {
    durationMs: performance.now() - startedAt,
    engine: params.engine,
    exitCode,
    file: params.file,
    output:
      `${stdout}${stderr}${timedOut ? `\n[test-bun-isolated] timed out after ${params.timeoutMs}ms` : ""}`.trim(),
  };
}

function formatMs(durationMs: number): string {
  if (durationMs >= 60_000) {
    return `${(durationMs / 60_000).toFixed(2)}m`;
  }
  if (durationMs >= 1_000) {
    return `${(durationMs / 1_000).toFixed(2)}s`;
  }
  return `${Math.round(durationMs)}ms`;
}

function tailOutput(output: string, lineCount = 40): string {
  return output.split("\n").slice(-lineCount).join("\n");
}

function resolveVitestFallbackArgv(vitestConfig: string, files: string[]): string[] {
  return ["pnpm", "exec", "vitest", "run", "--config", vitestConfig, ...files];
}

function resolveVitestConfig(file: string): string {
  switch (resolveVitestSurface(file)) {
    case "main":
      return "vitest.config.ts";
    case "contracts":
      return "vitest.contracts.config.ts";
    case "live":
      return "vitest.live.config.ts";
    case "e2e":
      return "vitest.e2e.config.ts";
    case "channels":
      return "vitest.channels.config.ts";
    case "extensions":
      return "vitest.extensions.config.ts";
    case "gateway":
      return "vitest.gateway.config.ts";
    case "unit":
    default:
      return "vitest.unit.config.ts";
  }
}

function resolveVitestSurface(
  file: string,
): "main" | "channels" | "contracts" | "e2e" | "extensions" | "gateway" | "live" | "unit" {
  if (file.endsWith(".live.test.ts")) {
    return "live";
  }
  if (file.endsWith(".e2e.test.ts")) {
    return "e2e";
  }
  if (file.endsWith("/registry-backed.contract.test.ts")) {
    return "contracts";
  }
  if (
    file.startsWith("src/channels/plugins/contracts/") ||
    file.startsWith("src/plugins/contracts/")
  ) {
    return "contracts";
  }
  if (channelTestPrefixes.some((prefix) => file.startsWith(prefix))) {
    return "channels";
  }
  if (file.startsWith("extensions/")) {
    return "extensions";
  }
  if (file.startsWith("src/gateway/")) {
    return "gateway";
  }
  if (!isUnitConfigTestFile(file)) {
    return "main";
  }
  return "unit";
}

function shouldDirectVitestByPath(file: string): boolean {
  const normalized = file.replaceAll(path.sep, "/");
  const vitestSurface = resolveVitestSurface(normalized);
  if (bunAllowlistPatterns.some((pattern) => path.matchesGlob(normalized, pattern))) {
    return false;
  }
  if (bunPathRuleBypassPatterns.some((pattern) => path.matchesGlob(normalized, pattern))) {
    return false;
  }
  return (
    (vitestSurface === "unit" &&
      unitTestAdditionalExcludePatterns.some((pattern) => path.matchesGlob(normalized, pattern))) ||
    bunDirectVitestPatterns.some((pattern) => path.matchesGlob(normalized, pattern))
  );
}

async function runFile(file: string): Promise<RunResult> {
  return runFilesBatch([file]);
}

function isBunSlowFile(file: string): boolean {
  const normalized = file.replaceAll(path.sep, "/");
  return bunSlowFilePatterns.some((pattern) => path.matchesGlob(normalized, pattern));
}

function resolveBunBatchTimeoutMs(files: string[]): number {
  const configured = Number.parseInt(process.env.OPENCLAW_BUN_BATCH_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  const batchSize = files.length;
  if (files.length > 0 && files.every((file) => isBunSlowFile(file))) {
    // Bun is still materially slower than Vitest on the provider-config slice.
    // Keep the wrapper from misclassifying healthy runs as Bun-incompatible.
    return Math.max(90_000, Math.min(180_000, 30_000 * batchSize));
  }
  // In a full-suite run Bun batches compete with many other child processes.
  // Keep a real cutoff, but avoid classifying healthy 16-file groups as
  // Bun-incompatible just because they crossed a 30s wall-clock budget.
  if (!hasExplicitFileArgs && batchSize >= 8) {
    return Math.max(45_000, Math.min(90_000, 6_000 * batchSize));
  }
  // Two-file batches are the common full-suite pairing. Under Bun they often
  // clear in the 30-40s range on loaded machines, so a 30s floor causes
  // repeated split/retry churn without finding a real incompatibility.
  return Math.max(45_000, Math.min(75_000, 12_000 * batchSize));
}

function resolveBunPerTestTimeoutMs(files: string[]): number {
  const configured = Number.parseInt(process.env.OPENCLAW_BUN_TEST_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  if (files.length > 0 && files.every((file) => isBunSlowFile(file))) {
    return 20_000;
  }
  if (!hasExplicitFileArgs && files.length >= 8) {
    return 20_000;
  }
  return 20_000;
}

function resolveVitestFallbackTimeoutMs(vitestConfig: string, batchSize: number): number {
  const configured = Number.parseInt(process.env.OPENCLAW_BUN_VITEST_FALLBACK_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  if (vitestConfig === "vitest.config.ts") {
    return Math.max(12_000, 3_000 * batchSize);
  }
  return Math.max(vitestFallbackMinTimeoutMs, 4_000 * batchSize);
}

function resolveVitestFallbackBatchSize(vitestConfig: string): number {
  const configured = Number.parseInt(process.env.OPENCLAW_BUN_VITEST_FALLBACK_BATCH_SIZE ?? "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  // The main Vitest config carries the heaviest agent/runtime suites.
  // Starting smaller avoids repeated 64s timeout splits that make Bun wrapper
  // runs look hung even though the files pass once bisected.
  if (vitestConfig === "vitest.config.ts") {
    return Math.min(vitestFallbackBatchSize, 4);
  }
  return vitestFallbackBatchSize;
}

function resolveBunBatchSize(vitestConfig: string): number {
  if (!hasExplicitFileArgs && vitestConfig === "vitest.unit.config.ts") {
    return Math.min(bunBatchSize, 2);
  }
  if (
    !hasExplicitFileArgs &&
    (vitestConfig === "vitest.channels.config.ts" ||
      vitestConfig === "vitest.contracts.config.ts" ||
      vitestConfig === "vitest.gateway.config.ts" ||
      vitestConfig === "vitest.config.ts")
  ) {
    // Large mixed groups on these surfaces regularly hit the real-time cutoff,
    // then get re-run as smaller groups anyway. Start smaller and skip the
    // timeout/split churn.
    return Math.min(bunBatchSize, 2);
  }
  if (vitestConfig === "vitest.extensions.config.ts") {
    return 1;
  }
  return bunBatchSize;
}

async function runFilesBatch(files: string[]): Promise<RunResult> {
  const timeoutSeconds = Math.max(1, Math.ceil(resolveBunBatchTimeoutMs(files) / 1_000));
  const perTestTimeoutMs = resolveBunPerTestTimeoutMs(files);
  const bunResult = await runCommand({
    argv: [
      "timeout",
      "-s",
      "KILL",
      String(timeoutSeconds),
      "bun",
      "test",
      "--timeout",
      String(perTestTimeoutMs),
      ...files,
    ],
    engine: "bun",
    file: files.join(","),
  });
  if ([124, 137].includes(bunResult.exitCode) && !bunResult.output.includes("timed out after")) {
    return {
      ...bunResult,
      output: `${bunResult.output}\n[test-bun-isolated] timed out after ${timeoutSeconds}s`.trim(),
    };
  }
  return bunResult;
}

function chunkFiles(files: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < files.length; index += chunkSize) {
    chunks.push(files.slice(index, index + chunkSize));
  }
  return chunks;
}

function chunkFallbacks(fallbacks: PendingFallback[], chunkSize: number): PendingFallback[][] {
  const chunks: PendingFallback[][] = [];
  for (let index = 0; index < fallbacks.length; index += chunkSize) {
    chunks.push(fallbacks.slice(index, index + chunkSize));
  }
  return chunks;
}

function describeFallbackGroup(files: string[]): string {
  if (files.length === 0) {
    return "first=<none> last=<none>";
  }
  return `first=${files[0]} last=${files.at(-1)}`;
}

function describeBunGroup(files: string[]): string {
  if (files.length === 0) {
    return "files=<none>";
  }
  if (files.length <= 4) {
    return `files=${files.join(",")}`;
  }
  return describeFallbackGroup(files);
}

async function runVitestFallbackGroup(vitestConfig: string, files: string[]): Promise<RunResult> {
  const timeoutSeconds = Math.max(
    1,
    Math.ceil(resolveVitestFallbackTimeoutMs(vitestConfig, files.length) / 1_000),
  );
  return await runCommand({
    argv: [
      "timeout",
      "-s",
      "KILL",
      String(timeoutSeconds),
      ...resolveVitestFallbackArgv(vitestConfig, files),
    ],
    engine: "vitest-fallback",
    env: {
      ...process.env,
      OPENCLAW_TEST_ISOLATE: "1",
    },
    file: files.join(","),
  });
}

const allFiles = listTestFiles();
const files = resolveRequestedFiles(allFiles, args);
const bunSkipCache = hasExplicitFileArgs ? new Set<string>() : loadBunSkipCache();

if (files.length === 0) {
  console.error("[test-bun-isolated] no matching test files");
  process.exit(1);
}

console.log(
  `[test-bun-isolated] start files=${files.length} parallel=${maxParallel} cwd=${repoRoot}`,
);

const startedAt = performance.now();
const pendingTasks: BunTask[] = [];
const failures: RunResult[] = [];
const pendingFallbacks: PendingFallback[] = [];
const skippedSurfaceGroups = new Map<string, string[]>();
const cachedSkipGroups = new Map<string, string[]>();
let bunPasses = 0;
let vitestFallbackPasses = 0;
let completed = 0;

function enqueueBatch(filesToQueue: string[], vitestConfig: string): void {
  for (const chunk of chunkFiles(filesToQueue, resolveBunBatchSize(vitestConfig))) {
    pendingTasks.push({ files: chunk, vitestConfig });
  }
}

const bunCandidateGroups = new Map<string, string[]>();

function addGroupedLog(map: Map<string, string[]>, key: string, file: string): void {
  const group = map.get(key);
  if (group) {
    group.push(file);
  } else {
    map.set(key, [file]);
  }
}

for (const file of files) {
  const vitestSurface = resolveVitestSurface(file);
  const vitestConfig = resolveVitestConfig(file);
  if (directVitestSurfaces.has(vitestSurface) || shouldDirectVitestByPath(file)) {
    const skipReason = directVitestSurfaces.has(vitestSurface)
      ? `surface=${vitestSurface}`
      : "path-rule";
    pendingFallbacks.push({
      bunResult: {
        durationMs: 0,
        engine: "bun",
        exitCode: 1,
        file,
        output: `[test-bun-isolated] skipped bun for ${skipReason}`,
      },
      file,
      vitestConfig,
    });
    addGroupedLog(skippedSurfaceGroups, `${skipReason}|${vitestConfig}`, file);
    continue;
  }
  if (bunSkipCache.has(file)) {
    pendingFallbacks.push({
      bunResult: {
        durationMs: 0,
        engine: "bun",
        exitCode: 1,
        file,
        output: "[test-bun-isolated] skipped bun due to cached vitest fallback",
      },
      file,
      vitestConfig,
    });
    addGroupedLog(cachedSkipGroups, vitestConfig, file);
    continue;
  }
  if (bunSerialPatterns.some((pattern) => path.matchesGlob(file, pattern))) {
    pendingTasks.push({ files: [file], vitestConfig });
    continue;
  }
  const group = bunCandidateGroups.get(vitestConfig);
  if (group) {
    group.push(file);
  } else {
    bunCandidateGroups.set(vitestConfig, [file]);
  }
}

for (const [vitestConfig, groupedFiles] of bunCandidateGroups) {
  enqueueBatch(groupedFiles, vitestConfig);
}

for (const [groupKey, groupedFiles] of skippedSurfaceGroups) {
  const [surface, vitestConfig] = groupKey.split("|");
  console.log(
    `[test-bun-isolated] queued fallback files=${groupedFiles.length} reason=${surface} config=${vitestConfig}`,
  );
}

for (const [vitestConfig, groupedFiles] of cachedSkipGroups) {
  console.log(
    `[test-bun-isolated] queued fallback files=${groupedFiles.length} reason=cached-skip config=${vitestConfig}`,
  );
}

async function worker(): Promise<void> {
  while (pendingTasks.length > 0) {
    const task = pendingTasks.shift();
    if (!task) {
      return;
    }
    const result =
      task.files.length === 1 ? await runFile(task.files[0]) : await runFilesBatch(task.files);
    if (result.exitCode === 0) {
      completed += task.files.length;
      bunPasses += task.files.length;
      for (const file of task.files) {
        bunSkipCache.delete(file);
      }
      console.log(
        task.files.length === 1
          ? `[test-bun-isolated] pass ${completed}/${files.length} ${task.files[0]} ${formatMs(result.durationMs)} engine=bun`
          : `[test-bun-isolated] pass ${completed}/${files.length} files=${task.files.length} config=${task.vitestConfig} ${describeBunGroup(task.files)} ${formatMs(result.durationMs)} engine=bun-batch`,
      );
      continue;
    }
    if (task.files.length === 1) {
      const file = task.files[0];
      pendingFallbacks.push({
        bunResult: result,
        file,
        vitestConfig: task.vitestConfig,
      });
      console.log(
        `[test-bun-isolated] retry ${completed + pendingFallbacks.length}/${files.length} ${file} ${formatMs(result.durationMs)} engine=bun-failed config=${task.vitestConfig}`,
      );
      bunSkipCache.add(file);
      continue;
    }
    const midpoint = Math.ceil(task.files.length / 2);
    pendingTasks.push(
      { files: task.files.slice(0, midpoint), vitestConfig: task.vitestConfig },
      { files: task.files.slice(midpoint), vitestConfig: task.vitestConfig },
    );
    console.log(
      `[test-bun-isolated] split ${completed}/${files.length} files=${task.files.length} config=${task.vitestConfig} ${describeBunGroup(task.files)} ${formatMs(result.durationMs)} engine=${result.output.includes("timed out after") ? "bun-timeout-group" : "bun-batch"}`,
    );
  }
}

await Promise.all(
  Array.from({ length: Math.min(maxParallel, pendingTasks.length || 1) }, () => worker()),
);

// Persist Bun-incompatible discoveries before Vitest fallback work begins so
// later runs can skip the same files even if the current run is interrupted.
saveBunSkipCache(bunSkipCache);

const fallbackGroups = new Map<string, PendingFallback[]>();
for (const fallback of pendingFallbacks) {
  const group = fallbackGroups.get(fallback.vitestConfig);
  if (group) {
    group.push(fallback);
  } else {
    fallbackGroups.set(fallback.vitestConfig, [fallback]);
  }
}

for (const [vitestConfig, group] of fallbackGroups) {
  const pendingVitestTasks = chunkFallbacks(group, resolveVitestFallbackBatchSize(vitestConfig));
  while (pendingVitestTasks.length > 0) {
    const currentGroup = pendingVitestTasks.shift();
    if (!currentGroup) {
      continue;
    }
    const groupResult = await runVitestFallbackGroup(
      vitestConfig,
      currentGroup.map(({ file }) => file),
    );
    if (groupResult.exitCode === 0) {
      completed += currentGroup.length;
      vitestFallbackPasses += currentGroup.length;
      console.log(
        currentGroup.length === 1
          ? `[test-bun-isolated] pass ${completed}/${files.length} ${currentGroup[0].file} ${formatMs(currentGroup[0].bunResult.durationMs + groupResult.durationMs)} engine=vitest-fallback`
          : `[test-bun-isolated] pass ${completed}/${files.length} ${vitestConfig} files=${currentGroup.length} ${describeFallbackGroup(currentGroup.map(({ file }) => file))} ${formatMs(groupResult.durationMs)} engine=vitest-fallback`,
      );
      continue;
    }
    if (currentGroup.length === 1) {
      const fallback = currentGroup[0];
      const combinedOutput =
        `${fallback.bunResult.output}\n\n[test-bun-isolated] fallback -> vitest\n${groupResult.output}`.trim();
      completed += 1;
      failures.push({
        ...groupResult,
        file: fallback.file,
        durationMs: fallback.bunResult.durationMs + groupResult.durationMs,
        output: combinedOutput,
      });
      console.log(
        `[test-bun-isolated] fail ${completed}/${files.length} ${fallback.file} ${formatMs(fallback.bunResult.durationMs + groupResult.durationMs)} engine=vitest-fallback`,
      );
      continue;
    }
    const midpoint = Math.ceil(currentGroup.length / 2);
    pendingVitestTasks.push(currentGroup.slice(0, midpoint), currentGroup.slice(midpoint));
    console.log(
      `[test-bun-isolated] split ${completed}/${files.length} ${vitestConfig} files=${currentGroup.length} ${describeFallbackGroup(currentGroup.map(({ file }) => file))} ${formatMs(groupResult.durationMs)} engine=vitest-fallback`,
    );
  }
}

const durationMs = performance.now() - startedAt;

if (failures.length > 0) {
  console.error(
    `[test-bun-isolated] failed files=${failures.length} elapsed=${formatMs(durationMs)}`,
  );
  for (const failure of failures) {
    console.error(`\n[test-bun-isolated] failure ${failure.file}\n${tailOutput(failure.output)}`);
  }
  process.exit(1);
}

console.log(
  `[test-bun-isolated] done files=${files.length} elapsed=${formatMs(durationMs)} bun_passes=${bunPasses} vitest_fallback_passes=${vitestFallbackPasses}`,
);
