import { resolveCommandAuthorization } from "openclaw/plugin-sdk/command-auth";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { describe, expect, it, vi } from "vitest";

const maybeSendAckReactionMock = vi.hoisted(() => vi.fn());
const readStoreAllowFromForDmPolicyMock = vi.hoisted(() => vi.fn(async () => [] as string[]));

vi.mock("../../accounts.js", () => ({
  resolveWhatsAppAccount: (params: { cfg: OpenClawConfig; accountId?: string }) => ({
    accountId: params.accountId ?? "default",
    allowFrom: params.cfg.channels?.whatsapp?.allowFrom ?? [],
  }),
}));

vi.mock("../../identity.js", () => ({
  getPrimaryIdentityId: (identity: { e164?: string }) => identity.e164,
  getSelfIdentity: (msg: { selfE164?: string }) => ({ e164: msg.selfE164 }),
  getSenderIdentity: (msg: { senderE164?: string; senderName?: string }) => ({
    e164: msg.senderE164,
    name: msg.senderName,
  }),
}));

vi.mock("../../reconnect.js", () => ({
  newConnectionId: () => "conn-id",
}));

vi.mock("../../session.js", () => ({
  formatError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

vi.mock("../deliver-reply.js", () => ({
  deliverWebReply: vi.fn(),
}));

vi.mock("../loggers.js", () => ({
  whatsappInboundLog: {
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../util.js", () => ({
  elide: (value: string) => value,
}));

vi.mock("./ack-reaction.js", () => ({
  maybeSendAckReaction: (...args: unknown[]) => maybeSendAckReactionMock(...args),
}));

vi.mock("./inbound-context.js", () => ({
  resolveVisibleWhatsAppGroupHistory: () => undefined,
  resolveVisibleWhatsAppReplyContext: () => undefined,
}));

vi.mock("./inbound-dispatch.js", async () => {
  const actual =
    await vi.importActual<typeof import("./inbound-dispatch.js")>("./inbound-dispatch.js");
  return {
    ...actual,
    dispatchWhatsAppBufferedReply: async (params: {
      context: Parameters<typeof resolveCommandAuthorization>[0]["ctx"];
      replyResolver: (
        ctx: Parameters<typeof resolveCommandAuthorization>[0]["ctx"],
      ) => Promise<unknown>;
    }) => params.replyResolver(params.context),
    updateWhatsAppMainLastRoute: vi.fn(),
  };
});

vi.mock("./last-route.js", () => ({
  trackBackgroundTask: vi.fn(),
  updateLastRouteInBackground: vi.fn(),
}));

vi.mock("./message-line.js", () => ({
  buildInboundLine: (params: { msg: { body: string } }) => params.msg.body,
}));

vi.mock("./runtime-api.js", async () => {
  const actual = await vi.importActual<typeof import("./runtime-api.js")>("./runtime-api.js");
  return {
    ...actual,
    createChannelReplyPipeline: () => ({
      onModelSelected: undefined,
      responsePrefix: undefined,
    }),
    logVerbose: vi.fn(),
    readStoreAllowFromForDmPolicy: readStoreAllowFromForDmPolicyMock,
    recordSessionMetaFromInbound: vi.fn(async () => undefined),
    resolveChannelContextVisibilityMode: () => "full",
    resolveInboundSessionEnvelopeContext: () => ({
      storePath: "/tmp/openclaw-whatsapp-process-message-test.json",
      envelopeOptions: undefined,
      previousTimestamp: undefined,
    }),
    shouldLogVerbose: () => false,
  };
});

import { processMessage } from "./process-message.js";

function makeReplyLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as const;
}

function createDirectMessage(overrides: Partial<Parameters<typeof processMessage>[0]["msg"]> = {}) {
  return {
    id: "msg-1",
    from: "+123",
    to: "+123",
    body: "/status",
    timestamp: Date.now(),
    chatType: "direct",
    chatId: "direct:+123",
    conversationId: "+123",
    accountId: "default",
    senderE164: "+123",
    senderName: "Owner",
    selfE164: "+123",
    sendComposing: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    sendMedia: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Parameters<typeof processMessage>[0]["msg"];
}

async function runProcessMessage(params: {
  cfg: OpenClawConfig;
  msg?: Partial<Parameters<typeof processMessage>[0]["msg"]>;
  replyResolver: (
    ctx: Parameters<typeof resolveCommandAuthorization>[0]["ctx"],
  ) => Promise<unknown>;
}) {
  await processMessage({
    cfg: params.cfg as never,
    msg: createDirectMessage(params.msg),
    route: {
      agentId: "main",
      accountId: "default",
      sessionKey: "agent:main:whatsapp:direct:+123",
      mainSessionKey: "agent:main:whatsapp:direct:+123",
    } as never,
    groupHistoryKey: "whatsapp:default:direct:+123",
    groupHistories: new Map(),
    groupMemberNames: new Map(),
    connectionId: "conn",
    verbose: false,
    maxMediaBytes: 1024,
    replyResolver: params.replyResolver as never,
    replyLogger: makeReplyLogger() as never,
    backgroundTasks: new Set(),
    rememberSentText: vi.fn(),
    echoHas: vi.fn(() => false),
    echoForget: vi.fn(),
    buildCombinedEchoKey: vi.fn(() => "echo-key"),
  });
}

describe("processMessage", () => {
  it("keeps same-phone /status authorized when allowFrom excludes the linked number", async () => {
    const cfg = {
      channels: {
        whatsapp: {
          allowFrom: ["+999"],
        },
      },
    } as OpenClawConfig;
    const replyResolver = vi.fn(
      async (ctx: Parameters<typeof resolveCommandAuthorization>[0]["ctx"]) => {
        const auth = resolveCommandAuthorization({
          ctx,
          cfg,
          commandAuthorized: ctx.CommandAuthorized === true,
        });

        expect(ctx.CommandAuthorized).toBe(true);
        expect(ctx.ResolvedCommandAuthorization).toMatchObject({
          providerId: "whatsapp",
          ownerList: ["+999", "+123"],
          senderId: "+123",
          senderIsOwner: true,
          isAuthorizedSender: true,
        });
        expect(auth.senderId).toBe("+123");
        expect(auth.senderIsOwner).toBe(true);
        expect(auth.isAuthorizedSender).toBe(true);
        return undefined;
      },
    );

    await runProcessMessage({
      cfg,
      replyResolver,
    });

    expect(replyResolver).toHaveBeenCalledTimes(1);
    expect(readStoreAllowFromForDmPolicyMock).toHaveBeenCalledTimes(1);
  });

  it("keeps non-self /status unauthorized when sender is not in allowFrom", async () => {
    const cfg = {
      channels: {
        whatsapp: {
          allowFrom: ["+999"],
        },
      },
    } as OpenClawConfig;
    const replyResolver = vi.fn(
      async (ctx: Parameters<typeof resolveCommandAuthorization>[0]["ctx"]) => {
        const auth = resolveCommandAuthorization({
          ctx,
          cfg,
          commandAuthorized: ctx.CommandAuthorized === true,
        });

        expect(ctx.CommandAuthorized).toBe(false);
        expect(ctx.ResolvedCommandAuthorization).toMatchObject({
          providerId: "whatsapp",
          ownerList: ["+999"],
          senderId: "+555",
          senderIsOwner: false,
          isAuthorizedSender: false,
        });
        expect(auth.senderId).toBe("+555");
        expect(auth.senderIsOwner).toBe(false);
        expect(auth.isAuthorizedSender).toBe(false);
        return undefined;
      },
    );

    await runProcessMessage({
      cfg,
      msg: {
        from: "+555",
        to: "+123",
        conversationId: "+555",
        chatId: "direct:+555",
        senderE164: "+555",
        senderName: "Other",
        selfE164: "+123",
      },
      replyResolver,
    });

    expect(replyResolver).toHaveBeenCalledTimes(1);
  });
});
