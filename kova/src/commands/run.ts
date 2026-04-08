import { resolveKovaBackend } from "../backends/registry.js";
import type { KovaBackendId, KovaRunTarget } from "../backends/types.js";
import { findMissingKovaQaScenarioIds } from "../catalog/qa.js";
import type { KovaRunArtifact, KovaVerdict } from "../contracts/run-artifact.js";
import { isHelpFlag, renderRunHelp } from "../help.js";
import { createKovaRunId } from "../lib/run-id.js";
import { renderArtifactSummary } from "../report.js";

function shiftRequiredValue(args: string[], flag: string) {
  const value = args.shift();
  if (!value || value.startsWith("--")) {
    throw new Error(`missing value for ${flag}.`);
  }
  return value;
}

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
      const value = shiftRequiredValue(rest, "--provider-mode");
      if (value !== "mock-openai" && value !== "live-frontier") {
        throw new Error(
          `unsupported value for --provider-mode: ${value}. Use mock-openai or live-frontier.`,
        );
      }
      options.providerMode = value;
      continue;
    }
    if (arg === "--backend") {
      const value = shiftRequiredValue(rest, "--backend");
      if (value !== "host" && value !== "multipass" && value !== "parallels") {
        throw new Error(
          `unsupported value for --backend: ${value}. Use 'kova list backends' to inspect supported backends.`,
        );
      }
      options.backend = value;
      continue;
    }
    if (arg === "--provider") {
      const value = shiftRequiredValue(rest, "--provider");
      if (value !== "openai" && value !== "anthropic" && value !== "minimax") {
        throw new Error(
          `unsupported value for --provider: ${value}. Use openai, anthropic, or minimax.`,
        );
      }
      options.parallelsProvider = value;
      continue;
    }
    if (arg === "--model") {
      const value = shiftRequiredValue(rest, "--model").trim();
      if (!value) {
        throw new Error("missing value for --model.");
      }
      options.modelRefs.push(value);
      continue;
    }
    if (arg === "--judge-model") {
      const value = shiftRequiredValue(rest, "--judge-model").trim();
      if (!value) {
        throw new Error("missing value for --judge-model.");
      }
      options.judgeModel = value;
      continue;
    }
    if (arg === "--judge-timeout-ms") {
      const value = shiftRequiredValue(rest, "--judge-timeout-ms");
      if (!Number.isFinite(Number(value))) {
        throw new Error(`unsupported value for --judge-timeout-ms: ${value}. Use a number.`);
      }
      options.judgeTimeoutMs = Number(value);
      continue;
    }
    if (arg === "--fast") {
      options.candidateFastMode = true;
      continue;
    }
    if (arg === "--guest") {
      const value = shiftRequiredValue(rest, "--guest");
      if (value !== "macos" && value !== "windows" && value !== "linux") {
        throw new Error(`unsupported value for --guest: ${value}. Use macos, windows, or linux.`);
      }
      options.guest = value;
      continue;
    }
    if (arg === "--mode") {
      const value = shiftRequiredValue(rest, "--mode");
      if (value !== "fresh" && value !== "upgrade" && value !== "both") {
        throw new Error(`unsupported value for --mode: ${value}. Use fresh, upgrade, or both.`);
      }
      options.mode = value;
      continue;
    }
    if (arg === "--scenario") {
      const value = shiftRequiredValue(rest, "--scenario").trim();
      if (!value) {
        throw new Error("missing value for --scenario.");
      }
      options.scenarioIds.push(value);
      continue;
    }
    throw new Error(`unsupported kova run option: ${arg}`);
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
