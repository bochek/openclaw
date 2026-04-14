import { resolveCommandAuthorization } from "openclaw/plugin-sdk/command-auth";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { describe, expect, it, vi } from "vitest";

const maybeSendAckReactionMock = vi.hoisted(() => vi.fn());
const readStoreAllowFromForDmPolicyMock = vi.hoisted(() => vi.fn(async () => [] as string[]));
const resolveDmGroupAccessWithCommandGateMock = vi.hoisted(() =>
  vi.fn(() => ({ commandAuthorized: true })),
);
const shouldComputeCommandAuthorizedMock = vi.hoisted(() => vi.fn(() => true));

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

vi.mock("./inbound-dispatch.js", () => ({
  buildWhatsAppInboundContext: (params: {
    combinedBody: string;
    commandAuthorized?: boolean;
    resolvedCommandAuthorization?: Record<string, unknown>;
    msg: { body: string; from: string; to: string };
    route: { sessionKey: string; accountId?: string };
    sender: { id?: string; e164?: string; name?: string };
  }) => ({
    Body: params.combinedBody,
    BodyForAgent: params.msg.body,
    BodyForCommands: params.msg.body,
    RawBody: params.msg.body,
    CommandBody: params.msg.body,
    From: params.msg.from,
    To: params.msg.to,
    SessionKey: params.route.sessionKey,
    AccountId: params.route.accountId,
    SenderName: params.sender.name,
    SenderId: params.sender.id ?? params.sender.e164,
    SenderE164: params.sender.e164,
    CommandAuthorized: params.commandAuthorized,
    ResolvedCommandAuthorization: params.resolvedCommandAuthorization,
    Provider: "whatsapp",
    Surface: "whatsapp",
    OriginatingChannel: "whatsapp",
    OriginatingTo: params.msg.from,
  }),
  dispatchWhatsAppBufferedReply: async (params: {
    context: Parameters<typeof resolveCommandAuthorization>[0]["ctx"];
    replyResolver: (
      ctx: Parameters<typeof resolveCommandAuthorization>[0]["ctx"],
    ) => Promise<unknown>;
  }) => params.replyResolver(params.context),
  resolveWhatsAppDmRouteTarget: () => undefined,
  resolveWhatsAppResponsePrefix: () => undefined,
  updateWhatsAppMainLastRoute: vi.fn(),
}));

vi.mock("./last-route.js", () => ({
  trackBackgroundTask: vi.fn(),
  updateLastRouteInBackground: vi.fn(),
}));

vi.mock("./message-line.js", () => ({
  buildInboundLine: (params: { msg: { body: string } }) => params.msg.body,
}));

vi.mock("./runtime-api.js", () => ({
  buildHistoryContextFromEntries: vi.fn(),
  createChannelReplyPipeline: () => ({
    onModelSelected: undefined,
    responsePrefix: undefined,
  }),
  formatInboundEnvelope: vi.fn(),
  logVerbose: vi.fn(),
  normalizeE164: (value: string) => {
    const digits = value.replace(/\D+/g, "");
    return digits ? `+${digits}` : null;
  },
  readStoreAllowFromForDmPolicy: readStoreAllowFromForDmPolicyMock,
  recordSessionMetaFromInbound: vi.fn(async () => undefined),
  resolveChannelContextVisibilityMode: () => "full",
  resolveInboundSessionEnvelopeContext: () => ({
    storePath: "/tmp/openclaw-whatsapp-process-message-test.json",
    envelopeOptions: undefined,
    previousTimestamp: undefined,
  }),
  resolvePinnedMainDmOwnerFromAllowlist: () => null,
  resolveDmGroupAccessWithCommandGate: resolveDmGroupAccessWithCommandGateMock,
  shouldComputeCommandAuthorized: shouldComputeCommandAuthorizedMock,
  shouldLogVerbose: () => false,
}));

import { processMessage } from "./process-message.js";

function makeReplyLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as const;
}

describe("processMessage", () => {
  it("passes resolved self-chat command authorization through to core command auth", async () => {
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
          ownerList: ["+123"],
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

    await processMessage({
      cfg,
      msg: {
        id: "self-status",
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
      } as never,
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
      replyResolver: replyResolver as never,
      replyLogger: makeReplyLogger() as never,
      backgroundTasks: new Set(),
      rememberSentText: vi.fn(),
      echoHas: vi.fn(() => false),
      echoForget: vi.fn(),
      buildCombinedEchoKey: vi.fn(() => "echo-key"),
    });

    expect(shouldComputeCommandAuthorizedMock).toHaveBeenCalledWith("/status", cfg);
    expect(resolveDmGroupAccessWithCommandGateMock).toHaveBeenCalledTimes(1);
    expect(replyResolver).toHaveBeenCalledTimes(1);
  });
});
