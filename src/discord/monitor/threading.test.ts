import { ChannelType, type Client } from "@buape/carbon";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAgentSessionKey } from "../../routing/resolve-route.js";
import {
  __resetDiscordThreadStarterCacheForTest,
  resolveDiscordAutoThreadContext,
  resolveDiscordAutoThreadReplyPlan,
  resolveDiscordReplyDeliveryPlan,
  resolveDiscordThreadStarter,
} from "./threading.js";

describe("resolveDiscordAutoThreadContext", () => {
  it("returns null when no createdThreadId", () => {
    expect(
      resolveDiscordAutoThreadContext({
        agentId: "agent",
        channel: "discord",
        messageChannelId: "parent",
        createdThreadId: undefined,
      }),
    ).toBeNull();
  });

  it("re-keys session context to the created thread", () => {
    const context = resolveDiscordAutoThreadContext({
      agentId: "agent",
      channel: "discord",
      messageChannelId: "parent",
      createdThreadId: "thread",
    });
    expect(context).not.toBeNull();
    expect(context?.To).toBe("channel:thread");
    expect(context?.From).toBe("discord:channel:thread");
    expect(context?.OriginatingTo).toBe("channel:thread");
    expect(context?.SessionKey).toBe(
      buildAgentSessionKey({
        agentId: "agent",
        channel: "discord",
        peer: { kind: "channel", id: "thread" },
      }),
    );
    expect(context?.ParentSessionKey).toBe(
      buildAgentSessionKey({
        agentId: "agent",
        channel: "discord",
        peer: { kind: "channel", id: "parent" },
      }),
    );
  });
});

describe("resolveDiscordReplyDeliveryPlan", () => {
  it("uses reply references when posting to the original target", () => {
    const plan = resolveDiscordReplyDeliveryPlan({
      replyTarget: "channel:parent",
      replyToMode: "all",
      messageId: "m1",
      threadChannel: null,
      createdThreadId: null,
    });
    expect(plan.deliverTarget).toBe("channel:parent");
    expect(plan.replyTarget).toBe("channel:parent");
    expect(plan.replyReference.use()).toBe("m1");
  });

  it("disables reply references when autoThread creates a new thread", () => {
    const plan = resolveDiscordReplyDeliveryPlan({
      replyTarget: "channel:parent",
      replyToMode: "all",
      messageId: "m1",
      threadChannel: null,
      createdThreadId: "thread",
    });
    expect(plan.deliverTarget).toBe("channel:thread");
    expect(plan.replyTarget).toBe("channel:thread");
    expect(plan.replyReference.use()).toBeUndefined();
  });

  it("always uses existingId when inside a thread", () => {
    const plan = resolveDiscordReplyDeliveryPlan({
      replyTarget: "channel:thread",
      replyToMode: "off",
      messageId: "m1",
      threadChannel: { id: "thread" },
      createdThreadId: null,
    });
    expect(plan.replyReference.use()).toBe("m1");
  });
});

describe("resolveDiscordAutoThreadReplyPlan", () => {
  it("switches delivery + session context to the created thread", async () => {
    const client = {
      rest: { post: async () => ({ id: "thread" }) },
    } as unknown as Client;
    const plan = await resolveDiscordAutoThreadReplyPlan({
      client,
      message: {
        id: "m1",
        channelId: "parent",
      } as unknown as import("./listeners.js").DiscordMessageEvent["message"],
      isGuildMessage: true,
      channelConfig: {
        autoThread: true,
      } as unknown as import("./allow-list.js").DiscordChannelConfigResolved,
      threadChannel: null,
      baseText: "hello",
      combinedBody: "hello",
      replyToMode: "all",
      agentId: "agent",
      channel: "discord",
    });
    expect(plan.deliverTarget).toBe("channel:thread");
    expect(plan.replyReference.use()).toBeUndefined();
    expect(plan.autoThreadContext?.SessionKey).toBe(
      buildAgentSessionKey({
        agentId: "agent",
        channel: "discord",
        peer: { kind: "channel", id: "thread" },
      }),
    );
  });

  it("does nothing when autoThread is disabled", async () => {
    const client = { rest: { post: async () => ({ id: "thread" }) } } as unknown as Client;
    const plan = await resolveDiscordAutoThreadReplyPlan({
      client,
      message: {
        id: "m1",
        channelId: "parent",
      } as unknown as import("./listeners.js").DiscordMessageEvent["message"],
      isGuildMessage: true,
      channelConfig: {
        autoThread: false,
      } as unknown as import("./allow-list.js").DiscordChannelConfigResolved,
      threadChannel: null,
      baseText: "hello",
      combinedBody: "hello",
      replyToMode: "all",
      agentId: "agent",
      channel: "discord",
    });
    expect(plan.deliverTarget).toBe("channel:parent");
    expect(plan.autoThreadContext).toBeNull();
  });
});

describe("resolveDiscordThreadStarter cache", () => {
  afterEach(() => {
    vi.useRealTimers();
    __resetDiscordThreadStarterCacheForTest();
  });

  it("expires cached entries after TTL", async () => {
    vi.useFakeTimers();
    const baseTime = new Date("2026-02-12T00:00:00Z").getTime();
    vi.setSystemTime(baseTime);

    const restGet = vi.fn(async () => ({
      content: "starter",
      author: { username: "starter", id: "user-1" },
      timestamp: "2026-02-12T00:00:00Z",
    }));
    const client = { rest: { get: restGet } } as unknown as Client;

    const params = {
      channel: { id: "thread-1" },
      client,
      parentId: "parent-1",
      parentType: ChannelType.GuildText,
      resolveTimestampMs: () => baseTime,
    };

    const first = await resolveDiscordThreadStarter(params);
    expect(first?.text).toBe("starter");
    expect(restGet).toHaveBeenCalledTimes(1);

    vi.setSystemTime(baseTime + 60_000);
    const second = await resolveDiscordThreadStarter(params);
    expect(second).toEqual(first);
    expect(restGet).toHaveBeenCalledTimes(1);

    vi.setSystemTime(baseTime + 60_000 + 5 * 60_000 + 1);
    const third = await resolveDiscordThreadStarter(params);
    expect(third).toEqual(first);
    expect(restGet).toHaveBeenCalledTimes(2);
  });
});
