import {
  attachChannelToResults,
  createAttachedChannelResultAdapter,
  type ChannelOutboundAdapter,
} from "openclaw/plugin-sdk/channel-send-result";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { resolveOutboundSendDep, sanitizeForPlainText } from "openclaw/plugin-sdk/infra-runtime";
import {
  chunkTextWithMode,
  resolveChunkMode,
  resolveTextChunkLimit,
} from "openclaw/plugin-sdk/reply-chunking";
import { WHATSAPP_LEGACY_OUTBOUND_SEND_DEP_KEYS } from "./outbound-send-deps.js";
import { toWhatsappJid } from "./text-runtime.js";

function throwIfAborted(signal: AbortSignal | undefined | null): void {
  if (signal?.aborted) {
    const err = new Error("Operation aborted");
    err.name = "AbortError";
    throw err;
  }
}

type WhatsAppChunker = NonNullable<ChannelOutboundAdapter["chunker"]>;
type WhatsAppSendTextOptions = {
  verbose: boolean;
  cfg?: OpenClawConfig;
  mediaUrl?: string;
  mediaAccess?: {
    localRoots?: readonly string[];
    readFile?: (filePath: string) => Promise<Buffer>;
  };
  mediaLocalRoots?: readonly string[];
  mediaReadFile?: (filePath: string) => Promise<Buffer>;
  gifPlayback?: boolean;
  accountId?: string;
  quotedMessageKey?: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
    participant?: string;
  };
};
type WhatsAppSendMessage = (
  to: string,
  body: string,
  options: WhatsAppSendTextOptions,
) => Promise<{ messageId: string; toJid: string }>;
type WhatsAppSendPoll = (
  to: string,
  poll: Parameters<NonNullable<ChannelOutboundAdapter["sendPoll"]>>[0]["poll"],
  options: { verbose: boolean; accountId?: string; cfg?: OpenClawConfig },
) => Promise<{ messageId: string; toJid: string }>;

function resolveQuotedMessageKey(
  replyToMode: "off" | "first" | "all",
  replyToId: string | null | undefined,
  replyToParticipant: string | null | undefined,
  to: string,
) {
  if (replyToMode === "off") {
    return undefined;
  }
  const quotedId = replyToId?.trim();
  if (!quotedId) {
    return undefined;
  }
  const quotedParticipant = replyToParticipant?.trim();
  return {
    id: quotedId,
    remoteJid: toWhatsappJid(to),
    fromMe: false,
    ...(quotedParticipant ? { participant: toWhatsappJid(quotedParticipant) } : {}),
  };
}

type CreateWhatsAppOutboundBaseParams = {
  chunker: WhatsAppChunker;
  sendMessageWhatsApp: WhatsAppSendMessage;
  sendPollWhatsApp: WhatsAppSendPoll;
  shouldLogVerbose: () => boolean;
  resolveTarget: ChannelOutboundAdapter["resolveTarget"];
  resolveReplyToMode?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
  }) => "off" | "first" | "all";
  normalizeText?: (text: string | undefined) => string;
  skipEmptyText?: boolean;
};

export function createWhatsAppOutboundBase({
  chunker,
  sendMessageWhatsApp,
  sendPollWhatsApp,
  shouldLogVerbose,
  resolveTarget,
  resolveReplyToMode,
  normalizeText = (text) => text ?? "",
  skipEmptyText = false,
}: CreateWhatsAppOutboundBaseParams): Pick<
  ChannelOutboundAdapter,
  | "deliveryMode"
  | "chunker"
  | "chunkerMode"
  | "consumeReplyToAfterFirstMediaSend"
  | "textChunkLimit"
  | "sanitizeText"
  | "pollMaxOptions"
  | "resolveTarget"
  | "sendFormattedText"
  | "sendText"
  | "sendMedia"
  | "sendPoll"
> {
  const resolveEffectiveReplyToMode = (cfg: OpenClawConfig, accountId?: string | null) =>
    resolveReplyToMode?.({ cfg, accountId }) ?? "off";

  const sendTextRaw = async ({
    cfg,
    to,
    text,
    accountId,
    deps,
    gifPlayback,
    replyToId,
    replyToParticipant,
  }: Parameters<NonNullable<ChannelOutboundAdapter["sendText"]>>[0]) => {
    const normalizedText = normalizeText(text);
    if (skipEmptyText && !normalizedText) {
      return { messageId: "" };
    }
    const effectiveReplyToMode = resolveEffectiveReplyToMode(cfg, accountId);
    const send =
      resolveOutboundSendDep<WhatsAppSendMessage>(deps, "whatsapp", {
        legacyKeys: WHATSAPP_LEGACY_OUTBOUND_SEND_DEP_KEYS,
      }) ?? sendMessageWhatsApp;
    return await send(to, normalizedText, {
      verbose: false,
      cfg,
      accountId: accountId ?? undefined,
      gifPlayback,
      quotedMessageKey: resolveQuotedMessageKey(
        effectiveReplyToMode,
        replyToId,
        replyToParticipant,
        to,
      ),
    });
  };

  const sendMediaRaw = async ({
    cfg,
    to,
    text,
    mediaUrl,
    mediaAccess,
    mediaLocalRoots,
    mediaReadFile,
    accountId,
    deps,
    gifPlayback,
    replyToId,
    replyToParticipant,
  }: Parameters<NonNullable<ChannelOutboundAdapter["sendMedia"]>>[0]) => {
    const effectiveReplyToMode = resolveEffectiveReplyToMode(cfg, accountId);
    const send =
      resolveOutboundSendDep<WhatsAppSendMessage>(deps, "whatsapp", {
        legacyKeys: WHATSAPP_LEGACY_OUTBOUND_SEND_DEP_KEYS,
      }) ?? sendMessageWhatsApp;
    return await send(to, normalizeText(text), {
      verbose: false,
      cfg,
      mediaUrl,
      mediaAccess,
      mediaLocalRoots,
      mediaReadFile,
      accountId: accountId ?? undefined,
      gifPlayback,
      quotedMessageKey: resolveQuotedMessageKey(
        effectiveReplyToMode,
        replyToId,
        replyToParticipant,
        to,
      ),
    });
  };

  return {
    deliveryMode: "gateway",
    chunker,
    chunkerMode: "text",
    consumeReplyToAfterFirstMediaSend: ({ cfg, accountId }) =>
      resolveEffectiveReplyToMode(cfg, accountId) === "first",
    textChunkLimit: 4000,
    sanitizeText: ({ text }) => sanitizeForPlainText(text),
    pollMaxOptions: 12,
    resolveTarget,
    sendFormattedText: async ({
      cfg,
      to,
      text,
      accountId,
      deps,
      gifPlayback,
      replyToId,
      replyToParticipant,
      abortSignal,
    }) => {
      throwIfAborted(abortSignal);
      const limit = resolveTextChunkLimit(cfg, "whatsapp", accountId ?? undefined, {
        fallbackLimit: 4000,
      });
      if (limit === undefined) {
        return attachChannelToResults("whatsapp", [
          await sendTextRaw({
            cfg,
            to,
            text,
            accountId,
            deps,
            gifPlayback,
            replyToId,
            replyToParticipant,
          }),
        ]);
      }

      const replyToMode = resolveEffectiveReplyToMode(cfg, accountId);
      let nextReplyToId = replyToMode === "off" ? undefined : replyToId;
      let nextReplyToParticipant = replyToMode === "off" ? undefined : replyToParticipant;
      const results: Array<Awaited<ReturnType<typeof sendTextRaw>>> = [];
      const sendChunk = async (chunk: string) => {
        throwIfAborted(abortSignal);
        const result = await sendTextRaw({
          cfg,
          to,
          text: chunk,
          accountId,
          deps,
          gifPlayback,
          replyToId: nextReplyToId,
          replyToParticipant: nextReplyToParticipant,
        });
        results.push(result);
        if (nextReplyToId && replyToMode === "first") {
          nextReplyToId = undefined;
          nextReplyToParticipant = undefined;
        }
      };

      const chunkMode = resolveChunkMode(cfg, "whatsapp", accountId ?? undefined);
      if (chunkMode === "newline") {
        const blocks = chunkTextWithMode(text, limit, "newline");
        const blockChunks = blocks.length > 0 ? blocks : text ? [text] : [];
        for (const block of blockChunks) {
          const chunks = chunker(block, limit);
          const sendableChunks = chunks.length > 0 ? chunks : block ? [block] : [];
          for (const chunk of sendableChunks) {
            await sendChunk(chunk);
          }
        }
        return attachChannelToResults("whatsapp", results);
      }

      const chunks = chunker(text, limit);
      const sendableChunks = chunks.length > 0 ? chunks : text ? [text] : [];
      for (const chunk of sendableChunks) {
        await sendChunk(chunk);
      }
      return attachChannelToResults("whatsapp", results);
    },
    ...createAttachedChannelResultAdapter({
      channel: "whatsapp",
      sendText: sendTextRaw,
      sendMedia: sendMediaRaw,
      sendPoll: async ({ cfg, to, poll, accountId }) =>
        await sendPollWhatsApp(to, poll, {
          verbose: shouldLogVerbose(),
          accountId: accountId ?? undefined,
          cfg,
        }),
    }),
  };
}
