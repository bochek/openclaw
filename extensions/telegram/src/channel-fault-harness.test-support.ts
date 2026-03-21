import { vi } from "vitest";
import type {
  ChannelFaultHarness,
  ChannelHarnessEvent,
  ChannelHarnessIdleExpectation,
  ChannelHarnessOutboundCall,
  ChannelOutboundFault,
} from "../../../test/helpers/channel-fault-harness.js";
import {
  commandSpy,
  enqueueSystemEventSpy,
  answerCallbackQuerySpy,
  getLoadConfigMock,
  getOnHandler,
  getReadChannelAllowFromStoreMock,
  getUpsertChannelPairingRequestMock,
  makeForumGroupMessageCtx,
  makeTelegramMessageCtx,
  onSpy,
  replySpy,
  sendMessageSpy,
  telegramBotDepsForTest,
  telegramBotRuntimeForTest,
} from "./bot.create-telegram-bot.test-harness.js";
import { createTelegramBot, setTelegramBotRuntimeForTest } from "./bot.js";

type LoadedConfig = ReturnType<(typeof import("openclaw/plugin-sdk/config-runtime"))["loadConfig"]>;

export type TelegramHarnessInboundEvent =
  | {
      kind: "message";
      ctx: Record<string, unknown>;
    }
  | {
      kind: "channel_post";
      ctx: Record<string, unknown>;
    }
  | {
      kind: "callback_query";
      ctx: Record<string, unknown>;
    }
  | {
      kind: "message_reaction";
      ctx: Record<string, unknown>;
    };

export type TelegramHarnessStableState = {
  replyCount: number;
  outboundCallCount: number;
  callbackAnswerCount: number;
  denialCount: number;
  fallbackCount: number;
  reactionEventCount: number;
  reactionContextKeys: string[];
  reactionSessionKeys: string[];
  sessionKeys: string[];
  dispatchBodies: string[];
  dispatchRawBodies: string[];
  dispatchMediaCounts: number[];
};

const TELEGRAM_HARNESS_TEST_TIMINGS = {
  mediaGroupFlushMs: 20,
  textFragmentGapMs: 30,
} as const;

function createDefaultConfig(): LoadedConfig {
  return {
    agents: {
      defaults: {
        envelopeTimezone: "utc",
      },
    },
    channels: {
      telegram: {
        dmPolicy: "open",
        allowFrom: ["*"],
        groupPolicy: "open",
        groups: { "*": { requireMention: false } },
      },
    },
  } as LoadedConfig;
}

function createFaultError(fault: ChannelOutboundFault): Error {
  const message =
    fault.message ??
    (fault.kind === "rate_limit"
      ? "rate limited"
      : fault.kind === "timeout"
        ? "timeout"
        : "telegram outbound send failed");
  if (fault.kind === "rate_limit") {
    return Object.assign(new Error(message), { status: 429 });
  }
  return new Error(message);
}

export function createTelegramMessageEvent(params: {
  chatId?: number;
  text: string;
  fromId?: number;
  username?: string;
  messageId?: number;
  updateId?: number;
  chatType?: "private" | "group" | "supergroup";
  isForum?: boolean;
  messageThreadId?: number;
  title?: string;
  photoFileId?: string;
  caption?: string;
  forwardOrigin?: Record<string, unknown>;
}): TelegramHarnessInboundEvent {
  return {
    kind: "message",
    ctx: {
      update: { update_id: params.updateId ?? params.messageId ?? 42 },
      ...makeTelegramMessageCtx({
        chat: {
          id: params.chatId ?? 7,
          type: params.chatType ?? "private",
          ...(params.title ? { title: params.title } : {}),
          ...(params.isForum === undefined ? {} : { is_forum: params.isForum }),
        },
        from: { id: params.fromId ?? 9, username: params.username ?? "ada" },
        text: params.text,
        ...(params.caption ? { caption: params.caption } : {}),
        messageId: params.messageId ?? 42,
        messageThreadId: params.messageThreadId,
        ...(params.photoFileId ? { photo: [{ file_id: params.photoFileId }] } : {}),
        ...(params.forwardOrigin ? { forward_origin: params.forwardOrigin } : {}),
      }),
      getFile: async () =>
        params.photoFileId ? { file_path: `photos/${params.photoFileId}.jpg` } : {},
    },
  };
}

export function createTelegramChannelPostEvent(params: {
  chatId?: number;
  title?: string;
  text?: string;
  caption?: string;
  messageId?: number;
  updateId?: number;
  date?: number;
  mediaGroupId?: string;
  photoFileId?: string;
  forwardOrigin?: Record<string, unknown>;
}): TelegramHarnessInboundEvent {
  return {
    kind: "channel_post",
    ctx: {
      update: { update_id: params.updateId ?? params.messageId ?? 42 },
      channelPost: {
        chat: {
          id: params.chatId ?? -100777111222,
          type: "channel",
          title: params.title ?? "Wake Channel",
        },
        message_id: params.messageId ?? 42,
        date: params.date ?? 1736380800,
        ...(params.text ? { text: params.text } : {}),
        ...(params.caption ? { caption: params.caption } : {}),
        ...(params.mediaGroupId ? { media_group_id: params.mediaGroupId } : {}),
        ...(params.photoFileId ? { photo: [{ file_id: params.photoFileId }] } : {}),
        ...(params.forwardOrigin ? { forward_origin: params.forwardOrigin } : {}),
      },
      me: { username: "openclaw_bot" },
      getFile: async () =>
        params.photoFileId ? { file_path: `photos/${params.photoFileId}.jpg` } : {},
    },
  };
}

export function createTelegramForumMessageEvent(params?: {
  chatId?: number;
  threadId?: number;
  text?: string;
  fromId?: number;
  username?: string;
  updateId?: number;
}): TelegramHarnessInboundEvent {
  const ctx = makeForumGroupMessageCtx({
    chatId: params?.chatId,
    threadId: params?.threadId,
    text: params?.text,
    fromId: params?.fromId,
    username: params?.username,
  }) as Record<string, unknown>;
  ctx.update = { update_id: params?.updateId ?? 99 };
  return { kind: "message", ctx };
}

export function createTelegramCallbackQueryEvent(params?: {
  callbackId?: string;
  data?: string;
  chatId?: number;
  messageId?: number;
  userId?: number;
  username?: string;
  updateId?: number;
}): TelegramHarnessInboundEvent {
  return {
    kind: "callback_query",
    ctx: {
      update: { update_id: params?.updateId ?? 88 },
      callbackQuery: {
        id: params?.callbackId ?? "cbq-1",
        data: params?.data ?? "cmd:option_a",
        from: {
          id: params?.userId ?? 9,
          first_name: "Ada",
          username: params?.username ?? "ada_bot",
        },
        message: {
          chat: { id: params?.chatId ?? 1234, type: "private" },
          date: 1736380800,
          message_id: params?.messageId ?? 11,
        },
      },
      me: { username: "openclaw_bot" },
      getFile: async () => ({ download: async () => new Uint8Array() }),
    },
  };
}

export function createTelegramReactionEvent(params?: {
  updateId?: number;
  chatId?: number;
  chatType?: "private" | "group" | "supergroup";
  isForum?: boolean;
  messageId?: number;
  userId?: number;
  username?: string;
  emoji?: string;
}): TelegramHarnessInboundEvent {
  return {
    kind: "message_reaction",
    ctx: {
      update: { update_id: params?.updateId ?? 901 },
      messageReaction: {
        chat: {
          id: params?.chatId ?? 1234,
          type: params?.chatType ?? "private",
          ...(params?.isForum === undefined ? {} : { is_forum: params.isForum }),
          ...(params?.chatType && params.chatType !== "private" ? { title: "Group Chat" } : {}),
        },
        message_id: params?.messageId ?? 42,
        user: {
          id: params?.userId ?? 9,
          first_name: "Ada",
          username: params?.username ?? "ada_bot",
        },
        date: 1736380800,
        old_reaction: [],
        new_reaction: [{ type: "emoji", emoji: params?.emoji ?? "👍" }],
      },
    },
  };
}

function resolveNativeCommandHandler(ctx: Record<string, unknown>) {
  const text = (ctx.message as { text?: string } | undefined)?.text?.trim() ?? "";
  if (!text.startsWith("/")) {
    return null;
  }
  const commandToken = text.slice(1).split(/\s+/, 1)[0] ?? "";
  const commandName = commandToken.split("@", 1)[0]?.trim();
  if (!commandName) {
    return null;
  }
  const handler = commandSpy.mock.calls.find((call) => call[0] === commandName)?.[1];
  if (typeof handler !== "function") {
    return null;
  }
  return handler as (ctx: Record<string, unknown>) => Promise<void>;
}

export function createTelegramChannelFaultHarness(params?: {
  config?: LoadedConfig;
  replyText?: string;
  replyError?: Error;
  testTimings?: {
    mediaGroupFlushMs?: number;
    textFragmentGapMs?: number;
  };
}): ChannelFaultHarness<TelegramHarnessInboundEvent, TelegramHarnessStableState> {
  const loadConfig = getLoadConfigMock();
  const readChannelAllowFromStore = getReadChannelAllowFromStoreMock();
  const upsertChannelPairingRequest = getUpsertChannelPairingRequestMock();
  const emittedEvents: ChannelHarnessEvent[] = [];
  const outboundCalls: ChannelHarnessOutboundCall[] = [];
  let activeFault: ChannelOutboundFault | null = null;
  let remainingFaultAttempts = 0;

  onSpy.mockReset();
  commandSpy.mockReset();
  enqueueSystemEventSpy.mockReset();
  loadConfig.mockReset();
  loadConfig.mockReturnValue(params?.config ?? createDefaultConfig());
  readChannelAllowFromStore.mockReset();
  readChannelAllowFromStore.mockResolvedValue([]);
  upsertChannelPairingRequest.mockReset();
  upsertChannelPairingRequest.mockResolvedValue({ code: "PAIRCODE", created: true });
  answerCallbackQuerySpy.mockReset().mockImplementation(async (callbackId: string) => {
    emittedEvents.push({ kind: "callback.answer", payload: { callbackId } });
  });
  sendMessageSpy
    .mockReset()
    .mockImplementation(async (chatId: number, body: string, meta?: unknown) => {
      const text = String(body);
      outboundCalls.push({
        kind: "telegram.send",
        target: String(chatId),
        body: text,
        meta:
          typeof meta === "object" && meta !== null
            ? ({ ...(meta as object) } as Record<string, unknown>)
            : {},
      });
      if (text.includes("Pairing code:") || text.includes("Your Telegram user id:")) {
        emittedEvents.push({ kind: "auth.denied", payload: { chatId, body: text } });
      }
      if (text === "You are not authorized to use this command.") {
        emittedEvents.push({ kind: "auth.denied", payload: { chatId, body: text } });
      }
      if (text === "Something went wrong while processing your request. Please try again.") {
        emittedEvents.push({ kind: "reply.fallback", payload: { chatId, body: text } });
      }
      if (activeFault && remainingFaultAttempts > 0) {
        remainingFaultAttempts -= 1;
        throw createFaultError(activeFault);
      }
      return { message_id: 77 };
    });
  replySpy.mockReset().mockImplementation(async (ctx, opts) => {
    emittedEvents.push({ kind: "reply.dispatch", payload: ctx });
    await opts?.onReplyStart?.();
    if (params?.replyError) {
      throw params.replyError;
    }
    return { text: params?.replyText ?? "final reply" };
  });

  setTelegramBotRuntimeForTest(
    telegramBotRuntimeForTest as unknown as Parameters<typeof setTelegramBotRuntimeForTest>[0],
  );
  createTelegramBot({
    token: "tok",
    telegramDeps: telegramBotDepsForTest,
    config: params?.config ?? createDefaultConfig(),
    testTimings: params?.testTimings ?? TELEGRAM_HARNESS_TEST_TIMINGS,
  });
  enqueueSystemEventSpy.mockImplementation((text: string, meta?: unknown) => {
    emittedEvents.push({ kind: "reaction.enqueue", payload: { text, ...(meta as object) } });
    return false;
  });

  return {
    inject: async (event) => {
      if (event.kind === "message") {
        const commandHandler = resolveNativeCommandHandler(event.ctx);
        if (commandHandler) {
          await commandHandler({
            ...event.ctx,
            match: "",
          });
          return;
        }
      }
      const handler = getOnHandler(event.kind);
      await handler(event.ctx);
    },
    injectSequence: async (events) => {
      for (const event of events) {
        if (event.kind === "message") {
          const commandHandler = resolveNativeCommandHandler(event.ctx);
          if (commandHandler) {
            await commandHandler({
              ...event.ctx,
              match: "",
            });
            continue;
          }
        }
        const handler = getOnHandler(event.kind);
        await handler(event.ctx);
      }
    },
    setOutboundFault: (fault) => {
      activeFault = fault;
      remainingFaultAttempts = Math.max(0, fault?.attempts ?? 1);
    },
    getOutboundCalls: () => [...outboundCalls],
    getEmittedEvents: () => [...emittedEvents],
    getStableState: () => ({
      replyCount: emittedEvents.filter((event) => event.kind === "reply.dispatch").length,
      outboundCallCount: outboundCalls.length,
      callbackAnswerCount: emittedEvents.filter((event) => event.kind === "callback.answer").length,
      denialCount: emittedEvents.filter((event) => event.kind === "auth.denied").length,
      fallbackCount: emittedEvents.filter((event) => event.kind === "reply.fallback").length,
      reactionEventCount: emittedEvents.filter((event) => event.kind === "reaction.enqueue").length,
      reactionContextKeys: emittedEvents
        .filter((event) => event.kind === "reaction.enqueue")
        .map((event) => (event.payload ?? {}) as Record<string, unknown>)
        .map((payload) => payload.contextKey)
        .filter((value): value is string => typeof value === "string"),
      reactionSessionKeys: emittedEvents
        .filter((event) => event.kind === "reaction.enqueue")
        .map((event) => (event.payload ?? {}) as Record<string, unknown>)
        .map((payload) => payload.sessionKey)
        .filter((value): value is string => typeof value === "string"),
      sessionKeys: emittedEvents
        .filter((event) => event.kind === "reply.dispatch")
        .map((event) => (event.payload ?? {}) as Record<string, unknown>)
        .map((payload) => payload.SessionKey)
        .filter((value): value is string => typeof value === "string"),
      dispatchBodies: emittedEvents
        .filter((event) => event.kind === "reply.dispatch")
        .map((event) => (event.payload ?? {}) as Record<string, unknown>)
        .map((payload) => payload.Body)
        .filter((value): value is string => typeof value === "string"),
      dispatchRawBodies: emittedEvents
        .filter((event) => event.kind === "reply.dispatch")
        .map((event) => (event.payload ?? {}) as Record<string, unknown>)
        .map((payload) => payload.RawBody)
        .filter((value): value is string => typeof value === "string"),
      dispatchMediaCounts: emittedEvents
        .filter((event) => event.kind === "reply.dispatch")
        .map((event) => (event.payload ?? {}) as Record<string, unknown>)
        .map((payload) => payload.MediaUrls)
        .map((value) => (Array.isArray(value) ? value.length : 0)),
    }),
    waitForIdle: async (expectation?: ChannelHarnessIdleExpectation) => {
      await vi.waitFor(() => {
        const minEvents = expectation?.minEmittedEvents ?? 1;
        const minOutbound = expectation?.minOutboundCalls ?? 0;
        if (emittedEvents.length < minEvents) {
          throw new Error(
            `waiting for emitted events: expected >= ${minEvents}, got ${emittedEvents.length}`,
          );
        }
        if (outboundCalls.length < minOutbound) {
          throw new Error(
            `waiting for outbound calls: expected >= ${minOutbound}, got ${outboundCalls.length}`,
          );
        }
      });
    },
  };
}
