import { runQaAdapter } from "../adapters/qa.js";
import { createKovaRunId } from "../lib/run-id.js";
import { renderArtifactSummary } from "../report.js";

function parseRunOptions(args: string[]) {
  const options: {
    target?: string;
    providerMode?: "mock-openai" | "live-frontier";
    scenarioIds: string[];
  } = {
    scenarioIds: [],
  };

  const rest = [...args];
  options.target = rest.shift();
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === "--provider-mode") {
      const value = rest.shift();
      if (value === "mock-openai" || value === "live-frontier") {
        options.providerMode = value;
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

export async function runCommand(repoRoot: string, args: string[]) {
  const options = parseRunOptions(args);
  if (options.target !== "qa") {
    throw new Error(`unsupported kova run target: ${String(options.target ?? "")}`);
  }

  const artifact = await runQaAdapter({
    repoRoot,
    runId: createKovaRunId(),
    providerMode: options.providerMode,
    scenarioIds: options.scenarioIds.length > 0 ? options.scenarioIds : undefined,
  });
  process.stdout.write(renderArtifactSummary(artifact));
}
