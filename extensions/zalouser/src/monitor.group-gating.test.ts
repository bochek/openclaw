import type { OpenClawConfig, PluginRuntime, RuntimeEnv } from "openclaw/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __testing } from "./monitor.js";
import { setZalouserRuntime } from "./runtime.js";
import type { ResolvedZalouserAccount, ZaloInboundMessage } from "./types.js";

const sendMessageZalouserMock = vi.hoisted(() => vi.fn(async () => {}));
const sendTypingZalouserMock = vi.hoisted(() => vi.fn(async () => {}));
const sendDeliveredZalouserMock = vi.hoisted(() => vi.fn(async () => {}));
const sendSeenZalouserMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("./send.js", () => ({
  sendMessageZalouser: sendMessageZalouserMock,
  sendTypingZalouser: sendTypingZalouserMock,
  sendDeliveredZalouser: sendDeliveredZalouserMock,
  sendSeenZalouser: sendSeenZalouserMock,
}));

function createAccount(): ResolvedZalouserAccount {
  return {
    accountId: "default",
    enabled: true,
    profile: "default",
    authenticated: true,
    config: {
      groupPolicy: "open",
      groups: {
        "*": { requireMention: true },
      },
    },
  };
}

function createConfig(): OpenClawConfig {
  return {
    channels: {
      zalouser: {
        enabled: true,
        groups: {
          "*": { requireMention: true },
        },
      },
    },
  };
}

function createRuntimeEnv(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: ((code: number): never => {
      throw new Error(`exit ${code}`);
    }) as RuntimeEnv["exit"],
  };
}

function installRuntime(params: { commandAuthorized: boolean }) {
  const dispatchReplyWithBufferedBlockDispatcher = vi.fn(async ({ dispatcherOptions, ctx }) => {
    await dispatcherOptions.typingCallbacks?.onReplyStart?.();
    return { queuedFinal: false, counts: { tool: 0, block: 0, final: 0 }, ctx };
  });
  const resolveAgentRoute = vi.fn((input: { peer?: { kind?: string; id?: string } }) => {
    const peerKind = input.peer?.kind === "direct" ? "direct" : "group";
    const peerId = input.peer?.id ?? "1";
    return {
      agentId: "main",
      sessionKey: `agent:main:zalouser:${peerKind}:${peerId}`,
      accountId: "default",
      mainSessionKey: "agent:main:main",
    };
  });

  setZalouserRuntime({
    logging: {
      shouldLogVerbose: () => false,
    },
    channel: {
      pairing: {
        readAllowFromStore: vi.fn(async () => []),
        upsertPairingRequest: vi.fn(async () => ({ code: "PAIR", created: true })),
        buildPairingReply: vi.fn(() => "pair"),
      },
      commands: {
        shouldComputeCommandAuthorized: vi.fn((body: string) => body.trim().startsWith("/")),
        resolveCommandAuthorizedFromAuthorizers: vi.fn(() => params.commandAuthorized),
        isControlCommandMessage: vi.fn((body: string) => body.trim().startsWith("/")),
        shouldHandleTextCommands: vi.fn(() => true),
      },
      mentions: {
        buildMentionRegexes: vi.fn(() => []),
        matchesMentionWithExplicit: vi.fn(
          (input) => input.explicit?.isExplicitlyMentioned === true,
        ),
      },
      groups: {
        resolveRequireMention: vi.fn((input) => {
          const cfg = input.cfg as OpenClawConfig;
          const groupCfg = cfg.channels?.zalouser?.groups ?? {};
          const groupEntry = input.groupId ? groupCfg[input.groupId] : undefined;
          const defaultEntry = groupCfg["*"];
          if (typeof groupEntry?.requireMention === "boolean") {
            return groupEntry.requireMention;
          }
          if (typeof defaultEntry?.requireMention === "boolean") {
            return defaultEntry.requireMention;
          }
          return true;
        }),
      },
      routing: {
        resolveAgentRoute,
      },
      session: {
        resolveStorePath: vi.fn(() => "/tmp"),
        readSessionUpdatedAt: vi.fn(() => undefined),
        recordInboundSession: vi.fn(async () => {}),
      },
      reply: {
        resolveEnvelopeFormatOptions: vi.fn(() => undefined),
        formatAgentEnvelope: vi.fn(({ body }) => body),
        finalizeInboundContext: vi.fn((ctx) => ctx),
        dispatchReplyWithBufferedBlockDispatcher,
      },
      text: {
        resolveMarkdownTableMode: vi.fn(() => "code"),
        convertMarkdownTables: vi.fn((text: string) => text),
        resolveChunkMode: vi.fn(() => "line"),
        chunkMarkdownTextWithMode: vi.fn((text: string) => [text]),
      },
    },
  } as unknown as PluginRuntime);

  return { dispatchReplyWithBufferedBlockDispatcher, resolveAgentRoute };
}

function createGroupMessage(overrides: Partial<ZaloInboundMessage> = {}): ZaloInboundMessage {
  return {
    threadId: "g-1",
    isGroup: true,
    senderId: "123",
    senderName: "Alice",
    groupName: "Team",
    content: "hello",
    timestampMs: Date.now(),
    msgId: "m-1",
    hasAnyMention: false,
    wasExplicitlyMentioned: false,
    canResolveExplicitMention: true,
    implicitMention: false,
    raw: { source: "test" },
    ...overrides,
  };
}

function createDmMessage(overrides: Partial<ZaloInboundMessage> = {}): ZaloInboundMessage {
  return {
    threadId: "u-1",
    isGroup: false,
    senderId: "321",
    senderName: "Bob",
    groupName: undefined,
    content: "hello",
    timestampMs: Date.now(),
    msgId: "dm-1",
    raw: { source: "test" },
    ...overrides,
  };
}

describe("zalouser monitor group mention gating", () => {
  beforeEach(() => {
    sendMessageZalouserMock.mockClear();
    sendTypingZalouserMock.mockClear();
    sendDeliveredZalouserMock.mockClear();
    sendSeenZalouserMock.mockClear();
  });

  it("skips unmentioned group messages when requireMention=true", async () => {
    const { dispatchReplyWithBufferedBlockDispatcher } = installRuntime({
      commandAuthorized: false,
    });
    await __testing.processMessage({
      message: createGroupMessage(),
      account: createAccount(),
      config: createConfig(),
      runtime: createRuntimeEnv(),
    });

    expect(dispatchReplyWithBufferedBlockDispatcher).not.toHaveBeenCalled();
    expect(sendTypingZalouserMock).not.toHaveBeenCalled();
  });

  it("fails closed when requireMention=true but mention detection is unavailable", async () => {
    const { dispatchReplyWithBufferedBlockDispatcher } = installRuntime({
      commandAuthorized: false,
    });
    await __testing.processMessage({
      message: createGroupMessage({
        canResolveExplicitMention: false,
        hasAnyMention: false,
        wasExplicitlyMentioned: false,
      }),
      account: createAccount(),
      config: createConfig(),
      runtime: createRuntimeEnv(),
    });

    expect(dispatchReplyWithBufferedBlockDispatcher).not.toHaveBeenCalled();
    expect(sendTypingZalouserMock).not.toHaveBeenCalled();
  });

  it("dispatches explicitly-mentioned group messages and marks WasMentioned", async () => {
    const { dispatchReplyWithBufferedBlockDispatcher } = installRuntime({
      commandAuthorized: false,
    });
    await __testing.processMessage({
      message: createGroupMessage({
        hasAnyMention: true,
        wasExplicitlyMentioned: true,
        content: "ping @bot",
      }),
      account: createAccount(),
      config: createConfig(),
      runtime: createRuntimeEnv(),
    });

    expect(dispatchReplyWithBufferedBlockDispatcher).toHaveBeenCalledTimes(1);
    const callArg = dispatchReplyWithBufferedBlockDispatcher.mock.calls[0]?.[0];
    expect(callArg?.ctx?.WasMentioned).toBe(true);
    expect(callArg?.ctx?.To).toBe("zalouser:group:g-1");
    expect(callArg?.ctx?.OriginatingTo).toBe("zalouser:group:g-1");
    expect(sendTypingZalouserMock).toHaveBeenCalledWith("g-1", {
      profile: "default",
      isGroup: true,
    });
  });

  it("allows authorized control commands to bypass mention gating", async () => {
    const { dispatchReplyWithBufferedBlockDispatcher } = installRuntime({
      commandAuthorized: true,
    });
    await __testing.processMessage({
      message: createGroupMessage({
        content: "/status",
        hasAnyMention: false,
        wasExplicitlyMentioned: false,
      }),
      account: createAccount(),
      config: createConfig(),
      runtime: createRuntimeEnv(),
    });

    expect(dispatchReplyWithBufferedBlockDispatcher).toHaveBeenCalledTimes(1);
    const callArg = dispatchReplyWithBufferedBlockDispatcher.mock.calls[0]?.[0];
    expect(callArg?.ctx?.WasMentioned).toBe(true);
  });

  it("routes DM messages with direct peer kind", async () => {
    const { dispatchReplyWithBufferedBlockDispatcher, resolveAgentRoute } = installRuntime({
      commandAuthorized: false,
    });
    const account = createAccount();
    await __testing.processMessage({
      message: createDmMessage(),
      account: {
        ...account,
        config: {
          ...account.config,
          dmPolicy: "open",
        },
      },
      config: createConfig(),
      runtime: createRuntimeEnv(),
    });

    expect(resolveAgentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        peer: { kind: "direct", id: "321" },
      }),
    );
    const callArg = dispatchReplyWithBufferedBlockDispatcher.mock.calls[0]?.[0];
    expect(callArg?.ctx?.SessionKey).toBe("agent:main:zalouser:direct:321");
  });
});
