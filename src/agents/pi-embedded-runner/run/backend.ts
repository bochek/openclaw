import { runCodexAppServerAttempt } from "../../codex-app-server-runner/run-attempt.js";
import { log } from "../logger.js";
import { runEmbeddedAttempt } from "./attempt.js";
import type { EmbeddedRunAttemptParams, EmbeddedRunAttemptResult } from "./types.js";

type EmbeddedAgentRuntime = "pi" | "codex-app-server" | "auto";

export async function runEmbeddedAttemptWithBackend(
  params: EmbeddedRunAttemptParams,
): Promise<EmbeddedRunAttemptResult> {
  const runtime = resolveEmbeddedAgentRuntime();
  const shouldUseCodexAppServer =
    runtime === "codex-app-server" || (runtime === "auto" && params.provider === "openai-codex");
  if (!shouldUseCodexAppServer) {
    return runEmbeddedAttempt(params);
  }
  try {
    return await runCodexAppServerAttempt(params);
  } catch (error) {
    if (runtime === "codex-app-server") {
      throw error;
    }
    log.warn("codex app-server backend failed; falling back to embedded PI backend", { error });
    return runEmbeddedAttempt(params);
  }
}

export function resolveEmbeddedAgentRuntime(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddedAgentRuntime {
  const raw = env.OPENCLAW_AGENT_RUNTIME?.trim();
  if (raw === "codex-app-server" || raw === "codex" || raw === "app-server") {
    return "codex-app-server";
  }
  if (raw === "auto") {
    return "auto";
  }
  return "pi";
}
