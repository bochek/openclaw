import { resolveSendableOutboundReplyParts } from "openclaw/plugin-sdk/reply-payload";
import type { MessagingToolSend } from "../../agents/pi-embedded-runner.js";
import type { OpenClawConfig } from "../../config/config.js";
import { splitByReplyToTags } from "../../utils/directive-tags.js";
import { stripHeartbeatToken } from "../heartbeat.js";
import type { OriginatingChannelType } from "../templating.js";
import type { ReplyPayload } from "../types.js";
import {
  resolveOriginAccountId,
  resolveOriginMessageProvider,
  resolveOriginMessageTo,
} from "./origin-routing.js";
import { shouldSuppressReasoningPayload } from "./reply-payloads-base.js";
import {
  applyReplyThreading,
  filterMessagingToolDuplicates,
  filterMessagingToolMediaDuplicates,
  shouldSuppressMessagingToolReplies,
} from "./reply-payloads.js";
import { resolveReplyToMode } from "./reply-threading.js";

function resolveCollectedAutoReplyTargetIds(params: {
  replyToMode: ReturnType<typeof resolveReplyToMode>;
  collectedMessageIds?: string[];
}): Set<string> | undefined {
  if (params.replyToMode !== "auto") {
    return undefined;
  }
  return params.collectedMessageIds?.length ? new Set(params.collectedMessageIds) : undefined;
}

export function resolveFollowupDeliveryPayloads(params: {
  cfg: OpenClawConfig;
  payloads: ReplyPayload[];
  messageProvider?: string;
  messageId?: string;
  collectedMessageIds?: string[];
  originatingAccountId?: string;
  originatingChannel?: string;
  originatingChatType?: string | null;
  originatingTo?: string;
  sentMediaUrls?: string[];
  sentTargets?: MessagingToolSend[];
  sentTexts?: string[];
}): ReplyPayload[] {
  const replyToChannel = resolveOriginMessageProvider({
    originatingChannel: params.originatingChannel,
    provider: params.messageProvider,
  }) as OriginatingChannelType | undefined;
  const replyToMode = resolveReplyToMode(
    params.cfg,
    replyToChannel,
    params.originatingAccountId,
    params.originatingChatType,
  );
  const collectedAutoReplyTargetIds = resolveCollectedAutoReplyTargetIds({
    replyToMode,
    collectedMessageIds: params.collectedMessageIds,
  });
  const sanitizedPayloads = params.payloads.flatMap((payload) => {
    const text = payload.text;
    if (!text || !text.includes("HEARTBEAT_OK")) {
      return [payload];
    }
    const stripped = stripHeartbeatToken(text, { mode: "message" });
    const hasMedia = resolveSendableOutboundReplyParts(payload).hasMedia;
    if (stripped.shouldSkip && !hasMedia) {
      return [];
    }
    return [{ ...payload, text: stripped.text }];
  });
  const nonReasoningPayloads = sanitizedPayloads.filter(
    (payload) => !shouldSuppressReasoningPayload(payload),
  );
  let didMultiTagSplit = false;
  const multiTagPayloads = nonReasoningPayloads
    .flatMap((payload) => {
      const text = payload.text;
      if (!text || !text.includes("[[")) {
        return [payload];
      }
      const segments = splitByReplyToTags(text);
      if (segments.length <= 1) {
        return [payload];
      }
      didMultiTagSplit = true;
      return segments.map((segment) => ({
        ...payload,
        text: segment.text,
        replyToId: segment.replyToId,
        replyToCurrent: segment.replyToCurrent,
      }));
    })
    .map((payload) => {
      if (!payload.replyToId || !collectedAutoReplyTargetIds) {
        return payload;
      }
      return collectedAutoReplyTargetIds.has(payload.replyToId)
        ? payload
        : {
            ...payload,
            replyToId: undefined,
            replyToCurrent: false,
          };
    });
  const hasCollectedMapping =
    replyToMode === "auto" &&
    params.collectedMessageIds &&
    multiTagPayloads.length === params.collectedMessageIds.length;
  const collectedPayloads = hasCollectedMapping
    ? multiTagPayloads.map((payload, index) =>
        payload.replyToId
          ? payload
          : {
              ...payload,
              replyToId: params.collectedMessageIds?.[index],
              replyToCurrent: true,
            },
      )
    : multiTagPayloads;
  const hasMultipleExplicitTargets =
    collectedPayloads.filter((payload) => payload.replyToId).length > 1;
  const effectiveReplyToMode =
    replyToMode === "auto"
      ? hasCollectedMapping || didMultiTagSplit || hasMultipleExplicitTargets
        ? "all"
        : "first"
      : replyToMode;
  const threadingPayloads =
    effectiveReplyToMode === "first" && replyToMode === "auto" && params.messageId
      ? collectedPayloads.map((payload) =>
          payload.replyToId
            ? payload
            : {
                ...payload,
                replyToId: params.messageId,
                replyToCurrent: true,
              },
        )
      : collectedPayloads;
  const replyTaggedPayloads = applyReplyThreading({
    payloads: threadingPayloads,
    replyToMode: effectiveReplyToMode,
    replyToChannel,
    currentMessageId: params.messageId,
  });
  const validatedReplyTaggedPayloads =
    replyToMode === "auto" && collectedAutoReplyTargetIds
      ? replyTaggedPayloads.map((payload) => {
          if (!payload.replyToId || collectedAutoReplyTargetIds.has(payload.replyToId)) {
            return payload;
          }
          return {
            ...payload,
            replyToId: undefined,
            replyToCurrent: false,
          };
        })
      : replyTaggedPayloads;
  const dedupedPayloads = filterMessagingToolDuplicates({
    payloads: validatedReplyTaggedPayloads,
    sentTexts: params.sentTexts ?? [],
  });
  const mediaFilteredPayloads = filterMessagingToolMediaDuplicates({
    payloads: dedupedPayloads,
    sentMediaUrls: params.sentMediaUrls ?? [],
  });
  const suppressMessagingToolReplies = shouldSuppressMessagingToolReplies({
    messageProvider: replyToChannel,
    messagingToolSentTargets: params.sentTargets,
    originatingTo: resolveOriginMessageTo({
      originatingTo: params.originatingTo,
    }),
    accountId: resolveOriginAccountId({
      originatingAccountId: params.originatingAccountId,
    }),
  });
  return suppressMessagingToolReplies ? [] : mediaFilteredPayloads;
}
