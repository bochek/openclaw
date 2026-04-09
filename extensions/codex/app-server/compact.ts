import {
  embeddedAgentLog,
  resolveEmbeddedAgentRuntime,
  type CompactEmbeddedPiSessionParams,
  type EmbeddedPiCompactResult,
} from "openclaw/plugin-sdk/agent-harness";
import { getSharedCodexAppServerClient, type CodexAppServerClient } from "./client.js";
import { readCodexAppServerBinding } from "./session-binding.js";

type CodexAppServerClientFactory = () => Promise<CodexAppServerClient>;

let clientFactory: CodexAppServerClientFactory = getSharedCodexAppServerClient;

export async function maybeCompactCodexAppServerSession(
  params: CompactEmbeddedPiSessionParams,
): Promise<EmbeddedPiCompactResult | undefined> {
  const runtime = resolveEmbeddedAgentRuntime();
  const provider = params.provider?.trim().toLowerCase();
  const shouldUseCodex =
    runtime === "codex" ||
    (runtime === "auto" && (provider === "codex" || provider === "openai-codex"));
  if (!shouldUseCodex) {
    return undefined;
  }

  const binding = await readCodexAppServerBinding(params.sessionFile);
  if (!binding?.threadId) {
    if (runtime === "codex") {
      return { ok: false, compacted: false, reason: "no codex app-server thread binding" };
    }
    return undefined;
  }

  const client = await clientFactory();
  await client.request("thread/compact/start", {
    threadId: binding.threadId,
  });
  embeddedAgentLog.info("started codex app-server compaction", {
    sessionId: params.sessionId,
    threadId: binding.threadId,
  });
  return {
    ok: true,
    compacted: true,
    result: {
      summary: "",
      firstKeptEntryId: "",
      tokensBefore: params.currentTokenCount ?? 0,
      details: {
        backend: "codex-app-server",
        threadId: binding.threadId,
      },
    },
  };
}

export const __testing = {
  setCodexAppServerClientFactoryForTests(factory: CodexAppServerClientFactory): void {
    clientFactory = factory;
  },
  resetCodexAppServerClientFactoryForTests(): void {
    clientFactory = getSharedCodexAppServerClient;
  },
} as const;
