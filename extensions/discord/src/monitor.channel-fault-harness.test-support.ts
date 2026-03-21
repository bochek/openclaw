import type { Client } from "@buape/carbon";
import { ChannelType, MessageType } from "@buape/carbon";
import { vi } from "vitest";
import {
  __testing as sessionBindingTesting,
  registerSessionBindingAdapter,
  type SessionBindingRecord,
} from "../../../src/infra/outbound/session-binding-service.js";
import type {
  ChannelFaultHarness,
  ChannelHarnessEvent,
  ChannelHarnessIdleExpectation,
  ChannelHarnessOutboundCall,
  ChannelOutboundFault,
} from "../../../test/helpers/channel-fault-harness.js";
import type { DiscordMessageEvent } from "./monitor/listeners.js";
import { __testing as threadBindingTesting } from "./monitor/thread-bindings.js";
import { rememberRecentUnboundWebhookEcho } from "./monitor/thread-bindings.state.js";
import type { ThreadBindingManager, ThreadBindingRecord } from "./monitor/thread-bindings.types.js";

type LoadedConfig = ReturnType<(typeof import("../../../src/config/config.js"))["loadConfig"]>;
type AnyMock = ReturnType<typeof vi.fn>;

const {
  dispatchMock,
  readAllowFromStoreMock,
  sendMock,
  updateLastRouteMock,
  upsertPairingRequestMock,
  loadConfigMock,
  sendWebhookMock,
  sendDiscordTextMock,
  resolveConfiguredBindingRouteMock,
  ensureConfiguredBindingRouteReadyMock,
  recordInboundSessionMock,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  readAllowFromStoreMock: vi.fn(),
  sendMock: vi.fn(),
  updateLastRouteMock: vi.fn(),
  upsertPairingRequestMock: vi.fn(),
  loadConfigMock: vi.fn(() => ({})),
  sendWebhookMock: vi.fn(),
  sendDiscordTextMock: vi.fn(),
  resolveConfiguredBindingRouteMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
  ensureConfiguredBindingRouteReadyMock: vi.fn(async () => ({ ok: true })),
  recordInboundSessionMock: vi.fn(async (_input?: unknown) => {}),
}));

vi.doMock("../../../src/config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/config/config.js")>();
  return {
    ...actual,
    loadConfig: () => loadConfigMock(),
  };
});

vi.doMock("./send.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./send.js")>();
  return {
    ...actual,
    sendMessageDiscord: (...args: unknown[]) => Reflect.apply(sendMock, undefined, args),
    sendWebhookMessageDiscord: (...args: unknown[]) =>
      Reflect.apply(sendWebhookMock, undefined, args),
    reactMessageDiscord: async () => undefined,
  };
});

vi.doMock("./send.shared.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./send.shared.js")>();
  return {
    ...actual,
    sendDiscordText: (...args: unknown[]) => Reflect.apply(sendDiscordTextMock, undefined, args),
  };
});

vi.mock("openclaw/plugin-sdk/reply-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/reply-runtime")>();
  return {
    ...actual,
    dispatchInboundMessage: (...args: unknown[]) => dispatchMock(...args),
    dispatchInboundMessageWithDispatcher: (...args: unknown[]) => dispatchMock(...args),
    dispatchInboundMessageWithBufferedDispatcher: (...args: unknown[]) => dispatchMock(...args),
  };
});

vi.mock("openclaw/plugin-sdk/reply-runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/reply-runtime")>();
  return {
    ...actual,
    dispatchInboundMessage: (...args: unknown[]) => dispatchMock(...args),
    dispatchInboundMessageWithDispatcher: (...args: unknown[]) => dispatchMock(...args),
    dispatchInboundMessageWithBufferedDispatcher: (...args: unknown[]) => dispatchMock(...args),
  };
});

vi.mock(
  "/Users/thoffman/openclaw/.worktrees/codex-channel-fault-harness/dist/plugin-sdk/reply-runtime.js",
  async (importOriginal) => {
    const actual = await importOriginal<typeof import("openclaw/plugin-sdk/reply-runtime")>();
    return {
      ...actual,
      dispatchInboundMessage: (...args: unknown[]) => dispatchMock(...args),
      dispatchInboundMessageWithDispatcher: (...args: unknown[]) => dispatchMock(...args),
      dispatchInboundMessageWithBufferedDispatcher: (...args: unknown[]) => dispatchMock(...args),
    };
  },
);

vi.mock(
  "/Users/thoffman/openclaw/.worktrees/codex-channel-fault-harness/src/plugin-sdk/reply-runtime.ts",
  async (importOriginal) => {
    const actual = await importOriginal<typeof import("openclaw/plugin-sdk/reply-runtime")>();
    return {
      ...actual,
      dispatchInboundMessage: (...args: unknown[]) => dispatchMock(...args),
      dispatchInboundMessageWithDispatcher: (...args: unknown[]) => dispatchMock(...args),
      dispatchInboundMessageWithBufferedDispatcher: (...args: unknown[]) => dispatchMock(...args),
    };
  },
);

vi.mock(
  "/Users/thoffman/openclaw/.worktrees/codex-channel-fault-harness/src/auto-reply/dispatch.ts",
  async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../src/auto-reply/dispatch.js")>();
    return {
      ...actual,
      dispatchInboundMessage: (...args: unknown[]) => dispatchMock(...args),
      dispatchInboundMessageWithDispatcher: (...args: unknown[]) => dispatchMock(...args),
      dispatchInboundMessageWithBufferedDispatcher: (...args: unknown[]) => dispatchMock(...args),
    };
  },
);

vi.mock("openclaw/plugin-sdk/conversation-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/conversation-runtime")>();
  return {
    ...actual,
    readChannelAllowFromStore: (...args: unknown[]) =>
      Reflect.apply(readAllowFromStoreMock, undefined, args),
    upsertChannelPairingRequest: (...args: unknown[]) =>
      Reflect.apply(upsertPairingRequestMock, undefined, args),
    resolveConfiguredBindingRoute: (...args: unknown[]) =>
      Reflect.apply(resolveConfiguredBindingRouteMock, undefined, args),
    ensureConfiguredBindingRouteReady: (...args: unknown[]) =>
      Reflect.apply(ensureConfiguredBindingRouteReadyMock, undefined, args),
  };
});
vi.mock("openclaw/plugin-sdk/conversation-runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/conversation-runtime")>();
  return {
    ...actual,
    readChannelAllowFromStore: (...args: unknown[]) =>
      Reflect.apply(readAllowFromStoreMock, undefined, args),
    upsertChannelPairingRequest: (...args: unknown[]) =>
      Reflect.apply(upsertPairingRequestMock, undefined, args),
    resolveConfiguredBindingRoute: (...args: unknown[]) =>
      Reflect.apply(resolveConfiguredBindingRouteMock, undefined, args),
    ensureConfiguredBindingRouteReady: (...args: unknown[]) =>
      Reflect.apply(ensureConfiguredBindingRouteReadyMock, undefined, args),
  };
});

vi.mock("openclaw/plugin-sdk/config-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/config-runtime")>();
  return {
    ...actual,
    loadConfig: () => loadConfigMock(),
    resolveStorePath: vi.fn(() => "/tmp/openclaw-sessions.json"),
    updateLastRoute: (...args: unknown[]) => Reflect.apply(updateLastRouteMock, undefined, args),
    resolveSessionKey: vi.fn(),
  };
});
vi.mock("openclaw/plugin-sdk/config-runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/config-runtime")>();
  return {
    ...actual,
    loadConfig: () => loadConfigMock(),
    resolveStorePath: vi.fn(() => "/tmp/openclaw-sessions.json"),
    updateLastRoute: (...args: unknown[]) => Reflect.apply(updateLastRouteMock, undefined, args),
    resolveSessionKey: vi.fn(),
  };
});

vi.mock("openclaw/plugin-sdk/channel-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/channel-runtime")>();
  return {
    ...actual,
    recordInboundSession: (...args: unknown[]) =>
      Reflect.apply(recordInboundSessionMock, undefined, args),
  };
});
vi.mock("openclaw/plugin-sdk/channel-runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/channel-runtime")>();
  return {
    ...actual,
    recordInboundSession: (...args: unknown[]) =>
      Reflect.apply(recordInboundSessionMock, undefined, args),
  };
});

vi.doMock("./threading.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    resolveDiscordAutoThreadReplyPlan: async ({
      messageChannelId,
    }: {
      messageChannelId: string;
    }) => ({
      deliverTarget: `channel:${messageChannelId}`,
      replyTarget: `channel:${messageChannelId}`,
      replyReference: {
        use: () => undefined,
        markSent: () => undefined,
      },
      autoThreadContext: undefined,
    }),
  };
});

export type DiscordHarnessStableState = {
  acceptedCount: number;
  droppedCount: number;
  lastDropReason?: string;
  dispatchCount: number;
  outboundCallCount: number;
  sessionKeys: string[];
  parentSessionKeys: string[];
  routeUpdates: Array<Record<string, unknown>>;
  recordedLastRoutes: Array<Record<string, unknown>>;
  touchedThreadIds: string[];
  outboundPaths: string[];
};

type DiscordHarnessBindingFixture = {
  sessionBinding?: SessionBindingRecord;
  threadRecord?: {
    accountId: string;
    threadId: string;
    targetSessionKey: string;
    agentId: string;
    label?: string;
    webhookId?: string;
    webhookToken?: string;
  };
  recentUnbound?: {
    accountId: string;
    channelId: string;
    threadId: string;
    webhookId: string;
    webhookToken?: string;
    targetSessionKey?: string;
    agentId?: string;
  };
};

function createBindingThreadManager(params?: {
  record?: DiscordHarnessBindingFixture["threadRecord"];
  touchedThreadIds?: string[];
}): ThreadBindingManager {
  const threadRecord = params?.record
    ? ({
        accountId: params.record.accountId,
        channelId: "p1",
        threadId: params.record.threadId,
        targetKind: "acp",
        targetSessionKey: params.record.targetSessionKey,
        agentId: params.record.agentId,
        label: params.record.label,
        webhookId: params.record.webhookId,
        webhookToken: params.record.webhookToken,
        boundBy: "test",
        boundAt: Date.now(),
        lastActivityAt: Date.now(),
      } satisfies ThreadBindingRecord)
    : undefined;
  return {
    accountId: threadRecord?.accountId ?? "default",
    getIdleTimeoutMs: () => 0,
    getMaxAgeMs: () => 0,
    getByThreadId: (threadId) => (threadRecord?.threadId === threadId ? threadRecord : undefined),
    getBySessionKey: (targetSessionKey) =>
      threadRecord?.targetSessionKey === targetSessionKey ? threadRecord : undefined,
    listBySessionKey: (targetSessionKey) =>
      threadRecord?.targetSessionKey === targetSessionKey ? [threadRecord] : [],
    listBindings: () => (threadRecord ? [threadRecord] : []),
    touchThread: ({ threadId }) => {
      params?.touchedThreadIds?.push(threadId);
      return threadRecord?.threadId === threadId ? threadRecord : null;
    },
    bindTarget: async () => null,
    unbindThread: () => null,
    unbindBySessionKey: () => [],
    stop: () => undefined,
  };
}

export function createConfiguredDiscordRoute(params: {
  conversationId: string;
  targetSessionKey: string;
  agentId: string;
}) {
  return {
    bindingResolution: {
      conversation: {
        channel: "discord",
        accountId: "default",
        conversationId: params.conversationId,
      },
      compiledBinding: {
        channel: "discord",
        accountPattern: "default",
        binding: {
          type: "acp",
          agentId: params.agentId,
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "channel", id: params.conversationId },
          },
        },
        bindingConversationId: params.conversationId,
        target: { conversationId: params.conversationId },
        agentId: params.agentId,
        provider: {
          compileConfiguredBinding: () => ({ conversationId: params.conversationId }),
          matchInboundConversation: () => ({ conversationId: params.conversationId }),
        },
        targetFactory: {
          driverId: "acp",
          materialize: () => ({
            record: {
              bindingId: `config:acp:discord:default:${params.conversationId}`,
              targetSessionKey: params.targetSessionKey,
              targetKind: "session",
              conversation: {
                channel: "discord",
                accountId: "default",
                conversationId: params.conversationId,
              },
              status: "active",
              boundAt: 0,
              metadata: {
                source: "config",
                mode: "persistent",
                agentId: params.agentId,
              },
            },
            statefulTarget: {
              kind: "stateful",
              driverId: "acp",
              sessionKey: params.targetSessionKey,
              agentId: params.agentId,
            },
          }),
        },
      },
      match: { conversationId: params.conversationId },
      record: {
        bindingId: `config:acp:discord:default:${params.conversationId}`,
        targetSessionKey: params.targetSessionKey,
        targetKind: "session",
        conversation: {
          channel: "discord",
          accountId: "default",
          conversationId: params.conversationId,
        },
        status: "active",
        boundAt: 0,
        metadata: {
          source: "config",
          mode: "persistent",
          agentId: params.agentId,
        },
      },
      statefulTarget: {
        kind: "stateful",
        driverId: "acp",
        sessionKey: params.targetSessionKey,
        agentId: params.agentId,
      },
    },
    configuredBinding: {
      spec: {
        channel: "discord",
        accountId: "default",
        conversationId: params.conversationId,
        agentId: params.agentId,
        mode: "persistent",
      },
      record: {
        bindingId: `config:acp:discord:default:${params.conversationId}`,
        targetSessionKey: params.targetSessionKey,
        targetKind: "session",
        conversation: {
          channel: "discord",
          accountId: "default",
          conversationId: params.conversationId,
        },
        status: "active",
        boundAt: 0,
        metadata: {
          source: "config",
          mode: "persistent",
          agentId: params.agentId,
        },
      },
    },
    boundSessionKey: params.targetSessionKey,
    route: {
      agentId: params.agentId,
      accountId: "default",
      channel: "discord",
      sessionKey: params.targetSessionKey,
      mainSessionKey: `agent:${params.agentId}:main`,
      matchedBy: "binding.channel",
      lastRoutePolicy: "bound",
    },
  } as const;
}

export function createDiscordGuildMessageEvent(params: {
  messageId: string;
  content: string;
  mentionedUsers?: Array<{ id: string }>;
  channelId?: string;
  authorId?: string;
  webhookId?: string;
  authorBot?: boolean;
}): DiscordMessageEvent {
  return {
    message: {
      id: params.messageId,
      content: params.content,
      channelId: params.channelId ?? "c1",
      timestamp: new Date().toISOString(),
      type: MessageType.Default,
      attachments: [],
      embeds: [],
      mentionedEveryone: false,
      mentionedUsers: params.mentionedUsers ?? [],
      mentionedRoles: [],
      webhookId: params.webhookId,
      author: {
        id: params.authorId ?? "u1",
        bot: params.authorBot ?? false,
        username: "Ada",
        tag: "Ada#1",
      },
    },
    author: {
      id: params.authorId ?? "u1",
      bot: params.authorBot ?? false,
      username: "Ada",
      tag: "Ada#1",
    },
    member: { displayName: "Ada" },
    guild: { id: "g1", name: "Guild" },
    guild_id: "g1",
  } as DiscordMessageEvent;
}

export function createDiscordWebhookThreadMessageEvent(params?: {
  messageId?: string;
  webhookId?: string;
  content?: string;
  channelId?: string;
  parentId?: string;
}): DiscordMessageEvent {
  return {
    message: {
      id: params?.messageId ?? "m-webhook",
      content: params?.content ?? "thread webhook echo",
      channelId: params?.channelId ?? "t1",
      timestamp: new Date().toISOString(),
      type: MessageType.Default,
      attachments: [],
      embeds: [],
      mentionedEveryone: false,
      mentionedUsers: [],
      mentionedRoles: [],
      webhookId: params?.webhookId ?? "wh-1",
      channel: {
        type: ChannelType.GuildText,
        name: "thread-name",
        parentId: params?.parentId ?? "p1",
        parent: { id: params?.parentId ?? "p1", name: "general" },
        isThread: () => true,
      },
      author: { id: "webhook-user", bot: true, username: "Webhook", tag: "Webhook#1" },
    },
    author: { id: "webhook-user", bot: true, username: "Webhook", tag: "Webhook#1" },
    member: { displayName: "Webhook" },
    guild: { id: "g1", name: "Guild" },
    guild_id: "g1",
  } as DiscordMessageEvent;
}

export function createDiscordHydratedMessageEvent(params?: {
  messageId?: string;
  channelId?: string;
  fetchedContent?: string;
}): DiscordMessageEvent {
  return {
    message: {
      id: params?.messageId ?? "m-hydrate",
      content: "",
      channelId: params?.channelId ?? "c1",
      timestamp: new Date().toISOString(),
      type: MessageType.Default,
      attachments: [],
      embeds: [],
      stickers: [{ id: "sticker-1" }],
      mentionedEveryone: false,
      mentionedUsers: [],
      mentionedRoles: [],
      author: {
        id: "u3",
        bot: false,
        username: "Eve",
        tag: "Eve#3",
      },
    },
    author: { id: "u3", bot: false, username: "Eve", tag: "Eve#3" },
    member: { displayName: "Eve" },
    guild: { id: "g1", name: "Guild" },
    guild_id: "g1",
  } as DiscordMessageEvent;
}

export function createDiscordThreadMessageEvent(params: {
  messageId: string;
  content?: string;
  includeStarter?: boolean;
  authorId?: string;
  authorBot?: boolean;
}): DiscordMessageEvent {
  return {
    message: {
      id: params.messageId,
      content: params.content ?? "thread reply",
      channelId: "t1",
      timestamp: new Date().toISOString(),
      type: MessageType.Default,
      attachments: [],
      embeds: [],
      mentionedEveryone: false,
      mentionedUsers: [],
      mentionedRoles: [],
      channel: {
        type: ChannelType.GuildText,
        name: "thread-name",
        parentId: "p1",
        parent: { id: "p1", name: "general" },
        isThread: () => true,
        ...(params.includeStarter
          ? {
              fetchStarterMessage: async () => ({
                content: "starter message",
                author: { tag: "Alice#1", username: "Alice" },
                createdTimestamp: Date.now(),
              }),
            }
          : {}),
      },
      author: {
        id: params.authorId ?? "u2",
        bot: params.authorBot ?? false,
        username: "Bob",
        tag: "Bob#2",
      },
    },
    author: {
      id: params.authorId ?? "u2",
      bot: params.authorBot ?? false,
      username: "Bob",
      tag: "Bob#2",
    },
    member: { displayName: "Bob" },
    guild: { id: "g1", name: "Guild" },
    guild_id: "g1",
  } as DiscordMessageEvent;
}

export function createDiscordThreadClient(): Client {
  return {
    fetchChannel: vi.fn().mockResolvedValue({
      type: ChannelType.GuildText,
      name: "thread-name",
    }),
    rest: {
      get: vi.fn().mockResolvedValue({
        content: "starter message",
        author: { id: "u1", username: "Alice", discriminator: "0001" },
        timestamp: new Date().toISOString(),
      }),
    },
  } as unknown as Client;
}

function createDefaultConfig(): LoadedConfig {
  return {
    agents: {
      defaults: {
        model: "anthropic/claude-opus-4-5",
        workspace: "/tmp/openclaw",
      },
    },
    session: { store: "/tmp/openclaw-discord-fault-harness-sessions.json" },
    channels: {
      discord: {
        dm: { enabled: true, policy: "open" },
        groupPolicy: "open",
        guilds: { "*": { requireMention: false, includeThreadStarter: true } },
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
        : "outbound send failed");
  if (fault.kind === "rate_limit") {
    return Object.assign(new Error(message), { status: 429 });
  }
  return new Error(message);
}

function shouldApplyFault(
  fault: ChannelOutboundFault | null,
  remainingFaultAttempts: number,
  surface: string,
): fault is ChannelOutboundFault {
  if (!fault || remainingFaultAttempts <= 0) {
    return false;
  }
  return !fault.surface || fault.surface === surface;
}

async function deliverHarnessDiscordReply(params: {
  ctx: Record<string, unknown>;
  replyText: string;
  threadBindings: ThreadBindingManager;
  outboundCallsBefore: number;
  outboundCalls: ChannelHarnessOutboundCall[];
  sendMock: AnyMock;
  sendWebhookMock: AnyMock;
}): Promise<void> {
  if (params.outboundCalls.length > params.outboundCallsBefore) {
    return;
  }
  const target =
    typeof params.ctx.OriginatingTo === "string"
      ? params.ctx.OriginatingTo
      : typeof params.ctx.To === "string"
        ? params.ctx.To
        : "channel:unknown";
  const targetChannelId = target.startsWith("channel:")
    ? target.slice("channel:".length).trim() || undefined
    : undefined;
  const sessionKey =
    typeof params.ctx.SessionKey === "string" ? params.ctx.SessionKey.trim() : undefined;
  const binding =
    sessionKey && targetChannelId
      ? params.threadBindings
          .listBySessionKey(sessionKey)
          .find((candidate) => candidate.threadId === targetChannelId)
      : undefined;
  if (binding?.webhookId && binding?.webhookToken) {
    try {
      await (
        params.sendWebhookMock as unknown as (
          body: string,
          opts: Record<string, unknown>,
        ) => Promise<unknown>
      )(params.replyText, {
        webhookId: binding.webhookId,
        webhookToken: binding.webhookToken,
        accountId: binding.accountId,
        threadId: binding.threadId,
      });
      return;
    } catch {
      // fall through to bot path
    }
  }
  const send = params.sendMock as unknown as (
    target: string,
    body: string,
    opts: Record<string, unknown>,
  ) => Promise<unknown>;
  for (;;) {
    try {
      await send(target, params.replyText, {});
      return;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 429) {
        throw error;
      }
      if (params.outboundCalls.length > params.outboundCallsBefore + 2) {
        throw error;
      }
    }
  }
}

export async function createDiscordChannelFaultHarness(params?: {
  cfg?: LoadedConfig;
  client?: Client;
  replyText?: string;
  bindingFixture?: DiscordHarnessBindingFixture;
  configuredRoute?: ReturnType<typeof createConfiguredDiscordRoute>;
}): Promise<ChannelFaultHarness<DiscordMessageEvent, DiscordHarnessStableState>> {
  const replyRuntime = await import("openclaw/plugin-sdk/reply-runtime");
  vi.spyOn(replyRuntime, "dispatchInboundMessage").mockImplementation(
    async (...args: unknown[]) => await dispatchMock(...args),
  );
  vi.spyOn(replyRuntime, "dispatchInboundMessageWithDispatcher").mockImplementation(
    async (...args: unknown[]) => await dispatchMock(...args),
  );
  vi.spyOn(replyRuntime, "dispatchInboundMessageWithBufferedDispatcher").mockImplementation(
    async (...args: unknown[]) => await dispatchMock(...args),
  );
  const { preflightDiscordMessage } = await import("./monitor/message-handler.preflight.js");
  const { processDiscordMessage } = await import("./monitor/message-handler.process.js");
  const emittedEvents: ChannelHarnessEvent[] = [];
  const outboundCalls: ChannelHarnessOutboundCall[] = [];
  const recordedLastRoutes: Array<Record<string, unknown>> = [];
  const touchedThreadIds: string[] = [];
  const outboundPaths: string[] = [];
  let activeFault: ChannelOutboundFault | null = null;
  let remainingFaultAttempts = 0;
  let acceptedCount = 0;
  let droppedCount = 0;
  let lastDropReason: string | undefined;

  sessionBindingTesting.resetSessionBindingAdaptersForTests();
  threadBindingTesting.resetThreadBindingsForTests();

  readAllowFromStoreMock.mockReset().mockResolvedValue([]);
  upsertPairingRequestMock.mockReset().mockResolvedValue({ code: "PAIRCODE", created: true });
  loadConfigMock.mockReset();
  resolveConfiguredBindingRouteMock
    .mockReset()
    .mockImplementation(() => params?.configuredRoute ?? null);
  ensureConfiguredBindingRouteReadyMock.mockReset().mockResolvedValue({ ok: true });
  updateLastRouteMock.mockReset().mockImplementation((route: unknown) => {
    emittedEvents.push({ kind: "route.update", payload: route });
  });
  recordInboundSessionMock.mockReset().mockImplementation(async (input?: unknown) => {
    const typedInput = (input ?? {}) as { updateLastRoute?: unknown; ctx?: unknown };
    emittedEvents.push({ kind: "session.record", payload: typedInput.ctx });
    if (typedInput.updateLastRoute) {
      recordedLastRoutes.push(typedInput.updateLastRoute as Record<string, unknown>);
      await updateLastRouteMock(typedInput.updateLastRoute);
    }
  });
  sendWebhookMock.mockReset().mockImplementation(async (_body: unknown, opts: unknown) => {
    outboundPaths.push("webhook");
    outboundCalls.push({
      kind: "discord.send",
      target:
        typeof opts === "object" &&
        opts !== null &&
        typeof (opts as { threadId?: unknown }).threadId === "string"
          ? `channel:${(opts as { threadId: string }).threadId}`
          : undefined,
      body: typeof _body === "string" ? _body : undefined,
      meta: {
        path: "webhook",
        ...(typeof opts === "object" && opts !== null
          ? ({ ...(opts as object) } as Record<string, unknown>)
          : {}),
      },
    });
    if (shouldApplyFault(activeFault, remainingFaultAttempts, "webhook")) {
      remainingFaultAttempts -= 1;
      throw createFaultError(activeFault);
    }
    return { id: `webhook-${outboundCalls.length}` };
  });
  sendDiscordTextMock
    .mockReset()
    .mockImplementation(async (_rest: unknown, channelId: unknown, body: unknown) => {
      outboundPaths.push("bot");
      outboundCalls.push({
        kind: "discord.send",
        target: typeof channelId === "string" ? `channel:${channelId}` : undefined,
        body: typeof body === "string" ? body : undefined,
        meta: { path: "bot.direct" },
      });
      if (shouldApplyFault(activeFault, remainingFaultAttempts, "bot")) {
        remainingFaultAttempts -= 1;
        throw createFaultError(activeFault);
      }
      return { id: `send-text-${outboundCalls.length}` };
    });
  sendMock.mockReset().mockImplementation(async (target: unknown, body: unknown, opts: unknown) => {
    outboundPaths.push("bot");
    outboundCalls.push({
      kind: "discord.send",
      target: typeof target === "string" ? target : undefined,
      body: typeof body === "string" ? body : undefined,
      meta: {
        path: "bot",
        ...(typeof opts === "object" && opts !== null
          ? ({ ...(opts as object) } as Record<string, unknown>)
          : {}),
      },
    });
    if (shouldApplyFault(activeFault, remainingFaultAttempts, "bot")) {
      remainingFaultAttempts -= 1;
      throw createFaultError(activeFault);
    }
    return { messageId: `msg-${outboundCalls.length}`, channelId: "channel-1" };
  });
  dispatchMock
    .mockReset()
    .mockImplementation(async ({ ctx, dispatcher }: Record<string, unknown>) => {
      emittedEvents.push({ kind: "dispatch", payload: ctx });
      const outboundCountBefore = outboundCalls.length;
      const typedDispatcher = dispatcher as {
        sendFinalReply?: (payload: { text: string }) => unknown;
        markComplete?: () => void;
        waitForIdle?: () => Promise<void>;
      };
      const sendFinalReply = typedDispatcher.sendFinalReply;
      await sendFinalReply?.({ text: params?.replyText ?? "final reply" });
      typedDispatcher.markComplete?.();
      await typedDispatcher.waitForIdle?.();
      await deliverHarnessDiscordReply({
        ctx: (ctx ?? {}) as Record<string, unknown>,
        replyText: params?.replyText ?? "final reply",
        threadBindings,
        outboundCallsBefore: outboundCountBefore,
        outboundCalls,
        sendMock,
        sendWebhookMock,
      });
      return { queuedFinal: true, counts: { final: 1, tool: 0, block: 0 } };
    });

  const cfg = params?.cfg ?? createDefaultConfig();
  loadConfigMock.mockReturnValue(cfg);
  const runtime = {
    log: vi.fn(),
    error: vi.fn(),
    exit: ((code: number) => {
      throw new Error(`exit ${code}`);
    }) as (code: number) => never,
  };

  const restGetMock = vi.fn().mockImplementation(async (_route: string) => {
    if (shouldApplyFault(activeFault, remainingFaultAttempts, "hydrate")) {
      remainingFaultAttempts -= 1;
      throw createFaultError(activeFault);
    }
    return {
      content: "hydrated fallback",
      attachments: [],
      embeds: [],
      mentions: [],
      mention_roles: [],
      mention_everyone: false,
      sticker_items: [],
      author: { id: "u3", username: "Eve", global_name: null },
      timestamp: new Date().toISOString(),
    };
  });
  const client = params?.client ?? ({} as Client);
  const clientRecord = client as unknown as Record<string, unknown>;
  if (!("fetchChannel" in client) || typeof client.fetchChannel !== "function") {
    clientRecord.fetchChannel = vi.fn().mockResolvedValue({
      type: ChannelType.GuildText,
      name: "general",
    });
  }
  const existingRest = (clientRecord.rest ?? {}) as Record<string, unknown>;
  const existingRestGet =
    typeof existingRest.get === "function"
      ? (existingRest.get as (route: string) => Promise<unknown>)
      : undefined;
  clientRecord.rest = {
    ...existingRest,
    get: existingRestGet
      ? vi.fn(async (route: string) => {
          if (shouldApplyFault(activeFault, remainingFaultAttempts, "hydrate")) {
            remainingFaultAttempts -= 1;
            throw createFaultError(activeFault);
          }
          return existingRestGet(route);
        })
      : restGetMock,
  };

  (client.fetchChannel as AnyMock | undefined)?.mockClear?.();

  const threadBindings = createBindingThreadManager({
    record: params?.bindingFixture?.threadRecord,
    touchedThreadIds,
  });
  const sessionBinding = params?.bindingFixture?.sessionBinding;
  if (sessionBinding) {
    registerSessionBindingAdapter({
      channel: "discord",
      accountId: sessionBinding.conversation.accountId,
      listBySession: (targetSessionKey) =>
        sessionBinding.targetSessionKey === targetSessionKey ? [sessionBinding] : [],
      resolveByConversation: (ref) => {
        const sameConversation =
          ref.channel === sessionBinding.conversation.channel &&
          ref.accountId === sessionBinding.conversation.accountId &&
          ref.conversationId === sessionBinding.conversation.conversationId &&
          (ref.parentConversationId ?? undefined) ===
            (sessionBinding.conversation.parentConversationId ?? undefined);
        return sameConversation ? sessionBinding : null;
      },
      touch: () => undefined,
    });
  }
  if (params?.bindingFixture?.recentUnbound) {
    rememberRecentUnboundWebhookEcho({
      accountId: params.bindingFixture.recentUnbound.accountId,
      channelId: params.bindingFixture.recentUnbound.channelId,
      threadId: params.bindingFixture.recentUnbound.threadId,
      targetKind: "acp",
      targetSessionKey:
        params.bindingFixture.recentUnbound.targetSessionKey ?? "agent:main:discord:channel:p1",
      agentId: params.bindingFixture.recentUnbound.agentId ?? "main",
      webhookId: params.bindingFixture.recentUnbound.webhookId,
      webhookToken: params.bindingFixture.recentUnbound.webhookToken,
      boundBy: "test",
      boundAt: Date.now(),
      lastActivityAt: Date.now(),
    });
  }

  const injectOne = async (event: DiscordMessageEvent) => {
    const ctx = await preflightDiscordMessage({
      cfg,
      discordConfig: cfg.channels?.discord,
      accountId: "default",
      token: "token",
      runtime,
      botUserId: "bot-id",
      guildHistories: new Map(),
      historyLimit: 0,
      mediaMaxBytes: 10_000,
      textLimit: 2000,
      replyToMode: "off",
      dmEnabled: true,
      groupDmEnabled: false,
      guildEntries: cfg.channels?.discord?.guilds,
      threadBindings,
      ackReactionScope: "group-mentions",
      groupPolicy: "open",
      data: event,
      client,
    });
    if (!ctx) {
      droppedCount += 1;
      lastDropReason =
        typeof event.message?.webhookId === "string"
          ? "webhook-echo-suppressed"
          : !event.message?.content
            ? "empty-or-rejected"
            : "preflight-rejected";
      emittedEvents.push({
        kind: "drop",
        payload: { messageId: event.message.id, reason: lastDropReason },
      });
      return;
    }
    acceptedCount += 1;
    emittedEvents.push({ kind: "accepted", payload: { messageId: event.message.id } });
    await processDiscordMessage(ctx);
  };

  return {
    inject: injectOne,
    injectSequence: async (events) => {
      for (const event of events) {
        await injectOne(event);
      }
    },
    setOutboundFault: (fault) => {
      activeFault = fault;
      remainingFaultAttempts = Math.max(0, fault?.attempts ?? 1);
    },
    getOutboundCalls: () => [...outboundCalls],
    getEmittedEvents: () => [...emittedEvents],
    getStableState: () => {
      const dispatchPayloads = emittedEvents
        .filter((event) => event.kind === "dispatch")
        .map((event) => (event.payload ?? {}) as Record<string, unknown>);
      const routeUpdates = emittedEvents
        .filter((event) => event.kind === "route.update")
        .map((event) => (event.payload ?? {}) as Record<string, unknown>);
      const derivedLastRoutes: Array<Record<string, unknown>> =
        recordedLastRoutes.length > 0
          ? [...recordedLastRoutes]
          : dispatchPayloads
              .map((payload) => {
                const sessionKey =
                  typeof payload.SessionKey === "string" ? payload.SessionKey : undefined;
                const to =
                  typeof payload.OriginatingTo === "string"
                    ? payload.OriginatingTo
                    : typeof payload.To === "string"
                      ? payload.To
                      : undefined;
                const accountId =
                  typeof payload.AccountId === "string" ? payload.AccountId : undefined;
                if (!sessionKey || !to || !accountId) {
                  return null;
                }
                return {
                  sessionKey,
                  channel: "discord",
                  to,
                  accountId,
                } as Record<string, unknown>;
              })
              .filter((value): value is NonNullable<typeof value> => value !== null);
      return {
        acceptedCount,
        droppedCount,
        lastDropReason,
        dispatchCount: dispatchPayloads.length,
        outboundCallCount: outboundCalls.length,
        sessionKeys: dispatchPayloads
          .map((payload) => payload.SessionKey)
          .filter((value): value is string => typeof value === "string"),
        parentSessionKeys: dispatchPayloads
          .map((payload) => payload.ParentSessionKey)
          .filter((value): value is string => typeof value === "string"),
        routeUpdates,
        recordedLastRoutes: derivedLastRoutes,
        touchedThreadIds: [...touchedThreadIds],
        outboundPaths: [...outboundPaths],
      };
    },
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
