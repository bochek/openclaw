import fs from "node:fs";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import {
  resolveSessionFilePath,
  resolveSessionFilePathOptions,
} from "../../config/sessions/paths.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveSessionAgentIds } from "../agent-scope.js";
import {
  limitAgentHookHistoryMessages,
  MAX_AGENT_HOOK_HISTORY_MESSAGES,
} from "../harness/hook-history.js";

export const MAX_CLI_SESSION_HISTORY_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_CLI_SESSION_HISTORY_MESSAGES = MAX_AGENT_HOOK_HISTORY_MESSAGES;

function resolveSafeCliSessionFile(params: {
  sessionId: string;
  sessionFile: string;
  sessionKey?: string;
  agentId?: string;
  config?: OpenClawConfig;
}): string {
  const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey,
    config: params.config,
    agentId: params.agentId,
  });
  return resolveSessionFilePath(
    params.sessionId,
    { sessionFile: params.sessionFile },
    resolveSessionFilePathOptions({
      agentId: sessionAgentId ?? defaultAgentId,
    }),
  );
}

export function loadCliSessionHistoryMessages(params: {
  sessionId: string;
  sessionFile: string;
  sessionKey?: string;
  agentId?: string;
  config?: OpenClawConfig;
}): unknown[] {
  try {
    const sessionFile = resolveSafeCliSessionFile(params);
    if (!fs.existsSync(sessionFile)) {
      return [];
    }
    const stat = fs.statSync(sessionFile);
    if (!stat.isFile() || stat.size > MAX_CLI_SESSION_HISTORY_FILE_BYTES) {
      return [];
    }
    const entries = SessionManager.open(sessionFile).getEntries();
    const history = entries.flatMap((entry) =>
      entry?.type === "message" ? [entry.message as unknown] : [],
    );
    return limitAgentHookHistoryMessages(history, MAX_CLI_SESSION_HISTORY_MESSAGES);
  } catch {
    return [];
  }
}
