import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateMessagesTokens } from "../../agents/compaction.js";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveFreshSessionTotalTokens, type SessionEntry } from "../../config/sessions/types.js";
import { readSessionMessages } from "../../gateway/session-utils.fs.js";

/**
 * Default max parent token count beyond which thread/session parent forking is skipped.
 * This prevents new thread sessions from inheriting near-full parent context.
 * See #26905.
 */
const DEFAULT_PARENT_FORK_MAX_TOKENS = 100_000;

export function resolveParentForkMaxTokens(cfg: OpenClawConfig): number {
  const configured = cfg.session?.parentForkMaxTokens;
  if (typeof configured === "number" && Number.isFinite(configured) && configured >= 0) {
    return Math.floor(configured);
  }
  return DEFAULT_PARENT_FORK_MAX_TOKENS;
}

function resolvePositiveTokenCount(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

/**
 * Resolve the best available token estimate for deciding whether parent-session
 * forking is safe. Prefer fresh persisted totals, then estimate from the
 * transcript when cached totals are stale or missing.
 */
export function resolveParentForkTokenCount(params: {
  parentEntry: SessionEntry;
  storePath: string;
}): number | undefined {
  const freshPersistedTokens = resolveFreshSessionTotalTokens(params.parentEntry);
  if (typeof freshPersistedTokens === "number") {
    return freshPersistedTokens;
  }

  const transcriptMessages = readSessionMessages(
    params.parentEntry.sessionId,
    params.storePath,
    params.parentEntry.sessionFile,
  ) as AgentMessage[];
  if (transcriptMessages.length > 0) {
    const estimatedTokens = estimateMessagesTokens(transcriptMessages);
    const transcriptTokens = resolvePositiveTokenCount(
      Number.isFinite(estimatedTokens) ? Math.ceil(estimatedTokens) : undefined,
    );
    if (typeof transcriptTokens === "number") {
      return transcriptTokens;
    }
  }

  return resolvePositiveTokenCount(params.parentEntry.totalTokens);
}

export async function forkSessionFromParent(params: {
  parentEntry: SessionEntry;
  agentId: string;
  sessionsDir: string;
}): Promise<{ sessionId: string; sessionFile: string } | null> {
  const runtime = await import("./session-fork.runtime.js");
  return runtime.forkSessionFromParentRuntime(params);
}
