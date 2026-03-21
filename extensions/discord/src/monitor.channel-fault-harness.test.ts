import { describe, expect, it } from "vitest";
import {
  createConfiguredDiscordRoute,
  createDiscordChannelFaultHarness,
  createDiscordGuildMessageEvent,
  createDiscordHydratedMessageEvent,
  createDiscordThreadClient,
  createDiscordThreadMessageEvent,
  createDiscordWebhookThreadMessageEvent,
} from "./monitor.channel-fault-harness.test-support.js";

describe("discord channel fault harness", () => {
  it("dispatches one reply path for a mentioned guild message", async () => {
    const harness = await createDiscordChannelFaultHarness({
      cfg: {
        agents: {
          defaults: {
            model: "anthropic/claude-opus-4-5",
            workspace: "/tmp/openclaw",
          },
        },
        session: { store: "/tmp/openclaw-discord-fault-harness-sessions.json" },
        messages: {
          responsePrefix: "PFX",
          groupChat: { mentionPatterns: ["\\bopenclaw\\b"] },
        },
        channels: {
          discord: {
            dm: { enabled: true, policy: "open" },
            groupPolicy: "open",
            guilds: { "*": { requireMention: true } },
          },
        },
      } as never,
    });

    await harness.inject(
      createDiscordGuildMessageEvent({
        messageId: "m1",
        content: "<@bot-id> hi",
        mentionedUsers: [{ id: "bot-id" }],
      }),
    );

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(1);
    expect(state.dispatchCount).toBe(1);
    expect(state.outboundCallCount).toBe(1);
    expect(state.sessionKeys[0]).toContain("agent:main:discord:");
  });

  it("records one last-route update and touches the thread binding on a successful bound-thread roundtrip", async () => {
    const harness = await createDiscordChannelFaultHarness({
      bindingFixture: {
        sessionBinding: {
          bindingId: "binding-thread",
          targetSessionKey: "agent:main:discord:channel:t1",
          targetKind: "session",
          conversation: {
            channel: "discord",
            accountId: "default",
            conversationId: "t1",
            parentConversationId: "p1",
          },
          status: "active",
          boundAt: Date.now(),
        },
        threadRecord: {
          accountId: "default",
          threadId: "t1",
          targetSessionKey: "agent:main:discord:channel:t1",
          agentId: "main",
          label: "main",
        },
      },
    });

    await harness.inject(createDiscordThreadMessageEvent({ messageId: "m-thread-route" }));

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(1);
    expect(state.dispatchCount).toBe(1);
    expect(state.recordedLastRoutes).toHaveLength(1);
    expect(state.recordedLastRoutes[0]).toEqual(
      expect.objectContaining({
        sessionKey: "agent:main:discord:channel:t1",
        channel: "discord",
        accountId: "default",
      }),
    );
    expect(state.touchedThreadIds).toContain("t1");
  });

  it("drops guild messages when requireMention applies and no mention is present", async () => {
    const harness = await createDiscordChannelFaultHarness({
      cfg: {
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
            guilds: { "*": { requireMention: true } },
          },
        },
      } as never,
    });

    await harness.inject(
      createDiscordGuildMessageEvent({ messageId: "m-no-mention", content: "hello" }),
    );

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(0);
    expect(state.droppedCount).toBe(1);
    expect(state.dispatchCount).toBe(0);
  });

  it("suppresses active bound-thread webhook echoes", async () => {
    const harness = await createDiscordChannelFaultHarness({
      bindingFixture: {
        sessionBinding: {
          bindingId: "binding-thread",
          targetSessionKey: "agent:main:discord:channel:t1",
          targetKind: "session",
          conversation: {
            channel: "discord",
            accountId: "default",
            conversationId: "t1",
            parentConversationId: "p1",
          },
          status: "active",
          boundAt: Date.now(),
          metadata: { webhookId: "wh-1" },
        },
      },
    });

    await harness.inject(createDiscordWebhookThreadMessageEvent());

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(0);
    expect(state.droppedCount).toBe(1);
    expect(state.dispatchCount).toBe(0);
    expect(state.lastDropReason).toBe("webhook-echo-suppressed");
  });

  it("suppresses recently unbound webhook echoes", async () => {
    const harness = await createDiscordChannelFaultHarness({
      bindingFixture: {
        recentUnbound: {
          accountId: "default",
          channelId: "p1",
          threadId: "t1",
          webhookId: "wh-1",
        },
      },
    });

    await harness.inject(createDiscordWebhookThreadMessageEvent());

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(0);
    expect(state.droppedCount).toBe(1);
    expect(state.dispatchCount).toBe(0);
  });

  it("routes configured ACP-bound channels without requiring a mention", async () => {
    const harness = await createDiscordChannelFaultHarness({
      cfg: {
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
            guilds: { "*": { requireMention: true } },
          },
        },
      } as never,
      configuredRoute: createConfiguredDiscordRoute({
        conversationId: "c-bound",
        targetSessionKey: "agent:main:discord:bound:channel:c-bound",
        agentId: "main",
      }),
    });

    await harness.inject(
      createDiscordGuildMessageEvent({
        messageId: "m-bound",
        channelId: "c-bound",
        content: "plain inbound text",
      }),
    );

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(1);
    expect(state.dispatchCount).toBe(1);
    expect(state.sessionKeys[0]).toBe("agent:main:discord:bound:channel:c-bound");
  });

  it("drops self-bot messages before dispatch", async () => {
    const harness = await createDiscordChannelFaultHarness();

    await harness.inject(
      createDiscordGuildMessageEvent({
        messageId: "m-self-bot",
        content: "hello from self",
        authorId: "bot-id",
        authorBot: true,
      }),
    );

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(0);
    expect(state.dispatchCount).toBe(0);
    expect(state.droppedCount).toBe(1);
  });

  it("hydrates empty sticker-only payloads before dispatch", async () => {
    const harness = await createDiscordChannelFaultHarness();

    await harness.inject(createDiscordHydratedMessageEvent());

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(1);
    expect(state.dispatchCount).toBe(1);
    expect(state.outboundCallCount).toBe(1);
  });

  it("captures thread routing context through the harness", async () => {
    const harness = await createDiscordChannelFaultHarness({
      client: createDiscordThreadClient(),
    });

    await harness.inject(
      createDiscordThreadMessageEvent({ messageId: "m-thread", includeStarter: true }),
    );

    const state = harness.getStableState();
    expect(state.sessionKeys[0]).toBe("agent:main:discord:channel:t1");
    expect(state.parentSessionKeys[0]).toBe("agent:main:discord:channel:p1");
  });

  it("falls back to the bot sender when bound-thread webhook delivery fails", async () => {
    const harness = await createDiscordChannelFaultHarness({
      bindingFixture: {
        sessionBinding: {
          bindingId: "binding-thread",
          targetSessionKey: "agent:main:discord:channel:t1",
          targetKind: "session",
          conversation: {
            channel: "discord",
            accountId: "default",
            conversationId: "t1",
            parentConversationId: "p1",
          },
          status: "active",
          boundAt: Date.now(),
          metadata: { webhookId: "wh-1" },
        },
        threadRecord: {
          accountId: "default",
          threadId: "t1",
          targetSessionKey: "agent:main:discord:channel:t1",
          agentId: "main",
          label: "main",
          webhookId: "wh-1",
          webhookToken: "wh-token",
        },
      },
    });
    harness.setOutboundFault({ kind: "error", attempts: 1, surface: "webhook" });

    await harness.inject(createDiscordThreadMessageEvent({ messageId: "m-fallback" }));

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(1);
    expect(state.dispatchCount).toBe(1);
    expect(state.outboundCallCount).toBe(2);
    expect(state.outboundPaths).toEqual(["webhook", "bot"]);
    expect(state.touchedThreadIds).toContain("t1");
  });

  it("drops bound-thread bot system-prefix traffic to prevent self-loops", async () => {
    const harness = await createDiscordChannelFaultHarness({
      bindingFixture: {
        sessionBinding: {
          bindingId: "binding-thread",
          targetSessionKey: "agent:main:discord:channel:t1",
          targetKind: "session",
          conversation: {
            channel: "discord",
            accountId: "default",
            conversationId: "t1",
            parentConversationId: "p1",
          },
          status: "active",
          boundAt: Date.now(),
        },
      },
      cfg: {
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
            allowBots: true,
            guilds: { "*": { requireMention: false } },
          },
        },
      } as never,
    });

    await harness.inject(
      createDiscordThreadMessageEvent({
        messageId: "m-bot-system",
        content:
          "🤖 codex-acp session active (auto-unfocus in 24h). Messages here go directly to this session.",
        authorBot: true,
        authorId: "relay-bot-1",
      }),
    );

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(0);
    expect(state.dispatchCount).toBe(0);
    expect(state.droppedCount).toBe(1);
  });

  it("accepts bot-authored mentioned traffic when allowBots is mention-scoped", async () => {
    const harness = await createDiscordChannelFaultHarness({
      cfg: {
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
            allowBots: "mentions",
            guilds: { "*": { requireMention: false } },
          },
        },
      } as never,
    });

    await harness.inject(
      createDiscordGuildMessageEvent({
        messageId: "m-bot-mention",
        content: "hi <@bot-id>",
        mentionedUsers: [{ id: "bot-id" }],
        authorBot: true,
        authorId: "relay-bot-1",
      }),
    );

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(1);
    expect(state.dispatchCount).toBe(1);
  });

  it("simulates a retryable outbound 429 at the adapter boundary", async () => {
    const harness = await createDiscordChannelFaultHarness();
    harness.setOutboundFault({ kind: "rate_limit", attempts: 1, surface: "bot" });

    await harness.inject(
      createDiscordGuildMessageEvent({ messageId: "m-retry", content: "hello" }),
    );

    const state = harness.getStableState();
    expect(state.acceptedCount).toBe(1);
    expect(state.dispatchCount).toBe(1);
    expect(state.outboundCallCount).toBe(2);
  });
});
