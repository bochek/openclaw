import { resolveKovaBackend } from "../backends/registry.js";
import type { KovaBackendId, KovaRunTarget } from "../backends/types.js";
import { findMissingKovaQaScenarioIds } from "../catalog/qa.js";
import type { KovaRunArtifact, KovaVerdict } from "../contracts/run-artifact.js";
import { isHelpFlag, renderRunHelp } from "../help.js";
import { createKovaRunId } from "../lib/run-id.js";
import { renderArtifactSummary } from "../report.js";

function parseRunOptions(args: string[]) {
  const options: {
    target?: KovaRunTarget;
    backend?: KovaBackendId;
    providerMode?: "mock-openai" | "live-frontier";
    parallelsProvider?: "openai" | "anthropic" | "minimax";
    modelRefs: string[];
    judgeModel?: string;
    judgeTimeoutMs?: number;
    candidateFastMode?: boolean;
    guest?: "macos" | "windows" | "linux";
    mode?: "fresh" | "upgrade" | "both";
    scenarioIds: string[];
    json: boolean;
  } = {
    modelRefs: [],
    scenarioIds: [],
    json: false,
  };

  const rest = args.filter((arg) => {
    if (arg === "--json") {
      options.json = true;
      return false;
    }
    return true;
  });
  const rawTarget = rest.shift();
  if (rawTarget === "qa" || rawTarget === "character-eval" || rawTarget === "parallels") {
    options.target = rawTarget;
  }
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === "--provider-mode") {
      const value = rest.shift();
      if (value === "mock-openai" || value === "live-frontier") {
        options.providerMode = value;
      }
      continue;
    }
    if (arg === "--backend") {
      const value = rest.shift();
      if (value === "host" || value === "multipass" || value === "parallels") {
        options.backend = value;
      }
      continue;
    }
    if (arg === "--provider") {
      const value = rest.shift();
      if (value === "openai" || value === "anthropic" || value === "minimax") {
        options.parallelsProvider = value;
      }
      continue;
    }
    if (arg === "--model") {
      const value = rest.shift();
      if (value?.trim()) {
        options.modelRefs.push(value.trim());
      }
      continue;
    }
    if (arg === "--judge-model") {
      const value = rest.shift();
      if (value?.trim()) {
        options.judgeModel = value.trim();
      }
      continue;
    }
    if (arg === "--judge-timeout-ms") {
      const value = rest.shift();
      if (value && Number.isFinite(Number(value))) {
        options.judgeTimeoutMs = Number(value);
      }
      continue;
    }
    if (arg === "--fast") {
      options.candidateFastMode = true;
      continue;
    }
    if (arg === "--guest") {
      const value = rest.shift();
      if (value === "macos" || value === "windows" || value === "linux") {
        options.guest = value;
      }
      continue;
    }
    if (arg === "--mode") {
      const value = rest.shift();
      if (value === "fresh" || value === "upgrade" || value === "both") {
        options.mode = value;
      }
      continue;
    }
    if (arg === "--scenario") {
      const value = rest.shift();
      if (value?.trim()) {
        options.scenarioIds.push(value.trim());
      }
    }
  }
  return options;
}

function resolveRunExitCode(artifact: KovaRunArtifact) {
  const exitCodes: Record<KovaVerdict, number> = {
    pass: 0,
    skipped: 0,
    degraded: 2,
    fail: 3,
    flaky: 4,
    blocked: 5,
  };
  return exitCodes[artifact.verdict];
}

export async function runCommand(repoRoot: string, args: string[]) {
  if (isHelpFlag(args)) {
    process.stdout.write(renderRunHelp());
    return;
  }
  const options = parseRunOptions(args);
  if (
    options.target !== "qa" &&
    options.target !== "character-eval" &&
    options.target !== "parallels"
  ) {
    throw new Error(`unsupported kova run target: ${String(options.target ?? "")}`);
  }
  if (options.target === "qa" && options.scenarioIds.length > 0) {
    const missingScenarioIds = findMissingKovaQaScenarioIds(options.scenarioIds);
    if (missingScenarioIds.length > 0) {
      throw new Error(
        `unknown qa scenario id(s): ${missingScenarioIds.join(", ")}. Use 'kova list scenarios qa' to inspect available scenario ids.`,
      );
    }
  }
  if (options.target === "character-eval") {
    if (options.scenarioIds.length > 1) {
      throw new Error("kova run character-eval accepts at most one --scenario value.");
    }
    const scenarioId = options.scenarioIds[0];
    if (scenarioId) {
      const missingScenarioIds = findMissingKovaQaScenarioIds([scenarioId]);
      if (missingScenarioIds.length > 0) {
        throw new Error(
          `unknown character-eval scenario id: ${missingScenarioIds.join(", ")}. Use 'kova list scenarios qa' to inspect available scenario ids.`,
        );
      }
    }
  }

  const backend = resolveKovaBackend(options.target, options.backend);
  const artifact = await backend.run({
    repoRoot,
    runId: createKovaRunId(),
    target: options.target,
    backend: options.backend,
    providerMode: options.providerMode,
    scenarioIds: options.scenarioIds.length > 0 ? options.scenarioIds : undefined,
    modelRefs: options.modelRefs.length > 0 ? options.modelRefs : undefined,
    axes:
      options.target === "parallels"
        ? {
            ...(options.guest ? { guest: options.guest } : {}),
            ...(options.mode ? { mode: options.mode } : {}),
            ...(options.parallelsProvider ? { provider: options.parallelsProvider } : {}),
          }
        : options.target === "character-eval"
          ? {
              ...(options.judgeModel ? { judgeModel: options.judgeModel } : {}),
              ...(options.judgeTimeoutMs ? { judgeTimeoutMs: String(options.judgeTimeoutMs) } : {}),
              ...(options.candidateFastMode ? { fast: "on" } : {}),
            }
          : undefined,
  });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  } else {
    process.stdout.write(renderArtifactSummary(artifact));
  }
  process.exitCode = resolveRunExitCode(artifact);
}
