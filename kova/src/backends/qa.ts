import { runCharacterEvalAdapter } from "../adapters/character-eval.js";
import { runQaAdapter } from "../adapters/qa.js";
import type { KovaBackend } from "./types.js";

export const qaBackend: KovaBackend = {
  id: "host",
  title: "Host runtime",
  kind: "host",
  runner: "host",
  supportsTarget(target): target is "qa" | "character-eval" {
    return target === "qa" || target === "character-eval";
  },
  async run(selection) {
    if (selection.target === "character-eval") {
      return await runCharacterEvalAdapter({
        repoRoot: selection.repoRoot,
        runId: selection.runId,
        scenarioId: selection.scenarioIds?.[0],
        modelRefs: selection.modelRefs,
        judgeModel: selection.axes?.judgeModel,
        judgeTimeoutMs: selection.axes?.judgeTimeoutMs
          ? Number(selection.axes.judgeTimeoutMs)
          : undefined,
        candidateFastMode: selection.axes?.fast === "on",
      });
    }
    return await runQaAdapter({
      repoRoot: selection.repoRoot,
      runId: selection.runId,
      providerMode: selection.providerMode,
      scenarioIds: selection.scenarioIds,
    });
  },
};
