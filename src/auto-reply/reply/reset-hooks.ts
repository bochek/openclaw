import fs from "node:fs/promises";
import { logVerbose } from "../../globals.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";

type BeforeResetSessionEntry = {
  sessionId?: string;
  sessionFile?: string;
} | null;

export function emitBeforeResetPluginHook(params: {
  sessionKey?: string;
  previousSessionEntry?: BeforeResetSessionEntry;
  workspaceDir: string;
  reason: string;
}): void {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("before_reset")) {
    return;
  }

  const prevEntry = params.previousSessionEntry;
  const sessionFile = prevEntry?.sessionFile;

  // Fire-and-forget: read old session messages and run hook before reset mutates the store.
  void (async () => {
    try {
      const messages: unknown[] = [];
      if (sessionFile) {
        const content = await fs.readFile(sessionFile, "utf-8");
        for (const line of content.split("\n")) {
          if (!line.trim()) {
            continue;
          }
          try {
            const entry = JSON.parse(line);
            if (entry.type === "message" && entry.message) {
              messages.push(entry.message);
            }
          } catch {
            // Skip malformed transcript lines.
          }
        }
      } else {
        logVerbose("before_reset: no session file available, firing hook with empty messages");
      }
      await hookRunner.runBeforeReset(
        { sessionFile, messages, reason: params.reason },
        {
          agentId: resolveAgentIdFromSessionKey(params.sessionKey),
          sessionKey: params.sessionKey,
          sessionId: prevEntry?.sessionId,
          workspaceDir: params.workspaceDir,
        },
      );
    } catch (err: unknown) {
      logVerbose(`before_reset hook failed: ${String(err)}`);
    }
  })();
}
