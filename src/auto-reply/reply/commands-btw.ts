import fs from "node:fs/promises";
import { spawnSubagentDirect } from "../../agents/subagent-spawn.js";
import {
  extractAssistantText,
  resolveInternalSessionKey,
  resolveMainSessionAlias,
} from "../../agents/tools/sessions-helpers.js";
import { logVerbose } from "../../globals.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import { extractTextFromChatContent } from "../../shared/chat-content.js";
import type { CommandHandler } from "./commands-types.js";

const BTW_PREFIX = "/btw";

function resolveRequesterSessionKey(params: Parameters<CommandHandler>[0]): string | undefined {
  const commandTarget = params.ctx.CommandTargetSessionKey?.trim();
  const commandSession = params.sessionKey?.trim();
  const preferCommandTarget = params.ctx.CommandSource === "native";
  const raw = preferCommandTarget
    ? commandTarget || commandSession
    : commandSession || commandTarget;
  if (!raw) {
    return undefined;
  }
  const { mainKey, alias } = resolveMainSessionAlias(params.cfg);
  return resolveInternalSessionKey({ key: raw, alias, mainKey });
}

function resolveBtwMessage(commandBodyNormalized: string): string | null {
  if (commandBodyNormalized === BTW_PREFIX) {
    return "";
  }
  if (!commandBodyNormalized.startsWith(`${BTW_PREFIX} `)) {
    return null;
  }
  return commandBodyNormalized.slice(BTW_PREFIX.length).trim();
}

function extractUserText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  if ((message as { role?: unknown }).role !== "user") {
    return undefined;
  }
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return undefined;
  }
  const joined =
    extractTextFromChatContent(content, {
      joinWith: " ",
      normalizeText: (text) => text.trim(),
    }) ?? "";
  return joined.trim() || undefined;
}

function extractContextLine(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const role = (message as { role?: unknown }).role;
  if (role === "assistant") {
    const text = extractAssistantText(message)?.trim();
    return text ? `assistant: ${text}` : null;
  }
  if (role === "user") {
    const text = extractUserText(message)?.trim();
    if (!text || text.toLowerCase().startsWith("/btw")) {
      return null;
    }
    return `user: ${text}`;
  }
  return null;
}

async function buildRecentSessionContext(params: {
  sessionFile?: string;
  maxMessages?: number;
  maxChars?: number;
}): Promise<string> {
  const sessionFile = params.sessionFile?.trim();
  if (!sessionFile) {
    return "";
  }

  let content: string;
  try {
    content = await fs.readFile(sessionFile, "utf-8");
  } catch {
    return "";
  }

  const lines = content.split("\n");
  const contextLines: string[] = [];
  const maxMessages = Math.max(1, params.maxMessages ?? 8);
  const maxChars = Math.max(200, params.maxChars ?? 2500);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as { type?: unknown; message?: unknown };
      if (parsed.type !== "message") {
        continue;
      }
      const contextLine = extractContextLine(parsed.message);
      if (!contextLine) {
        continue;
      }
      contextLines.push(contextLine);
      if (contextLines.length >= maxMessages) {
        break;
      }
    } catch {
      // Ignore malformed JSONL lines.
    }
  }
  if (contextLines.length === 0) {
    return "";
  }
  const ordered = contextLines.toReversed();
  let joined = ordered.join("\n");
  if (joined.length <= maxChars) {
    return joined;
  }
  joined = joined.slice(joined.length - maxChars);
  const firstNewline = joined.indexOf("\n");
  return firstNewline >= 0 ? joined.slice(firstNewline + 1) : joined;
}

export const handleBtwCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }

  const message = resolveBtwMessage(params.command.commandBodyNormalized);
  if (message === null) {
    return null;
  }

  if (!params.command.isAuthorizedSender) {
    logVerbose(`Ignoring /btw from unauthorized sender: ${params.command.senderId || "<unknown>"}`);
    return { shouldContinue: false };
  }

  if (!message) {
    return {
      shouldContinue: false,
      reply: { text: "Usage: /btw <message>" },
    };
  }

  const requesterSessionKey = resolveRequesterSessionKey(params);
  if (!requesterSessionKey) {
    return {
      shouldContinue: false,
      reply: { text: "⚠️ Missing session key." },
    };
  }

  const agentId =
    parseAgentSessionKey(requesterSessionKey)?.agentId ??
    parseAgentSessionKey(params.sessionKey)?.agentId;
  const sessionContext = await buildRecentSessionContext({
    sessionFile: params.sessionEntry?.sessionFile,
    maxMessages: 8,
    maxChars: 2500,
  });
  const sideQuestionTask = [
    "Side-question mode: answer only this one question.",
    "Do not use tools.",
    ...(sessionContext ? ["", "Current session context (recent messages):", sessionContext] : []),
    "",
    "Question:",
    message,
  ].join("\n");

  const normalizedTo =
    (typeof params.ctx.OriginatingTo === "string" ? params.ctx.OriginatingTo.trim() : "") ||
    (typeof params.command.to === "string" ? params.command.to.trim() : "") ||
    (typeof params.ctx.To === "string" ? params.ctx.To.trim() : "") ||
    undefined;

  const result = await spawnSubagentDirect(
    {
      task: sideQuestionTask,
      agentId,
      mode: "run",
      cleanup: "delete",
      expectsCompletionMessage: true,
    },
    {
      agentSessionKey: requesterSessionKey,
      agentChannel: params.ctx.OriginatingChannel ?? params.command.channel,
      agentAccountId: params.ctx.AccountId,
      agentTo: normalizedTo,
      agentThreadId: params.ctx.MessageThreadId,
      agentGroupId: params.sessionEntry?.groupId ?? null,
      agentGroupChannel: params.sessionEntry?.groupChannel ?? null,
      agentGroupSpace: params.sessionEntry?.space ?? null,
    },
  );

  if (result.status === "accepted") {
    return {
      shouldContinue: false,
      reply: {
        text: "Sent side question with /btw. I will post one answer here.",
      },
    };
  }

  return {
    shouldContinue: false,
    reply: { text: `⚠️ /btw failed: ${result.error ?? result.status}` },
  };
};
