import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPluginInteractiveHandlers,
  dispatchPluginInteractiveHandler,
  registerPluginInteractiveHandler,
} from "./interactive.js";

describe("plugin interactive handlers", () => {
  beforeEach(() => {
    clearPluginInteractiveHandlers();
  });

  it("routes Telegram callbacks by namespace and dedupes callback ids", async () => {
    const handler = vi.fn(async () => ({ handled: true }));
    expect(
      registerPluginInteractiveHandler("codex-plugin", {
        channel: "telegram",
        namespace: "codex",
        handler,
      }),
    ).toEqual({ ok: true });

    const baseParams = {
      channel: "telegram" as const,
      data: "codex:resume:thread-1",
      callbackId: "cb-1",
      ctx: {
        accountId: "default",
        callbackId: "cb-1",
        conversationId: "-10099:topic:77",
        parentConversationId: "-10099",
        senderId: "user-1",
        senderUsername: "ada",
        threadId: 77,
        isGroup: true,
        isForum: true,
        auth: { isAuthorizedSender: true },
        callbackMessage: {
          messageId: 55,
          chatId: "-10099",
          messageText: "Pick a thread",
        },
      },
      respond: {
        reply: vi.fn(async () => {}),
        editMessage: vi.fn(async () => {}),
        editButtons: vi.fn(async () => {}),
        clearButtons: vi.fn(async () => {}),
        deleteMessage: vi.fn(async () => {}),
      },
    };

    const first = await dispatchPluginInteractiveHandler(baseParams);
    const duplicate = await dispatchPluginInteractiveHandler(baseParams);

    expect(first).toEqual({ matched: true, handled: true, duplicate: false });
    expect(duplicate).toEqual({ matched: true, handled: true, duplicate: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        conversationId: "-10099:topic:77",
        callback: expect.objectContaining({
          namespace: "codex",
          payload: "resume:thread-1",
          chatId: "-10099",
          messageId: 55,
        }),
      }),
    );
  });

  it("rejects duplicate namespace registrations", () => {
    const first = registerPluginInteractiveHandler("plugin-a", {
      channel: "telegram",
      namespace: "codex",
      handler: async () => ({ handled: true }),
    });
    const second = registerPluginInteractiveHandler("plugin-b", {
      channel: "telegram",
      namespace: "codex",
      handler: async () => ({ handled: true }),
    });

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({
      ok: false,
      error: 'Interactive handler namespace "codex" already registered by plugin "plugin-a"',
    });
  });

  it("rejects unsupported interactive channels and malformed handlers", () => {
    expect(
      registerPluginInteractiveHandler("plugin-a", {
        channel: "slack",
        namespace: "codex",
        handler: async () => ({ handled: true }),
      } as unknown as Parameters<typeof registerPluginInteractiveHandler>[1]),
    ).toEqual({
      ok: false,
      error: 'Interactive handler channel must be either "telegram" or "discord"',
    });

    expect(
      registerPluginInteractiveHandler("plugin-a", {
        channel: "telegram",
        namespace: "codex",
        handler: "not-a-function",
      } as unknown as Parameters<typeof registerPluginInteractiveHandler>[1]),
    ).toEqual({
      ok: false,
      error: "Interactive handler must be a function",
    });
  });

  it("routes Discord interactions by namespace and dedupes interaction ids", async () => {
    const handler = vi.fn(async () => ({ handled: true }));
    expect(
      registerPluginInteractiveHandler("codex-plugin", {
        channel: "discord",
        namespace: "codex",
        handler,
      }),
    ).toEqual({ ok: true });

    const baseParams = {
      channel: "discord" as const,
      data: "codex:approve:thread-1",
      interactionId: "ix-1",
      ctx: {
        accountId: "default",
        interactionId: "ix-1",
        conversationId: "channel-1",
        parentConversationId: "parent-1",
        guildId: "guild-1",
        senderId: "user-1",
        senderUsername: "ada",
        auth: { isAuthorizedSender: true },
        interaction: {
          kind: "button" as const,
          messageId: "message-1",
          values: ["allow"],
        },
      },
      respond: {
        acknowledge: vi.fn(async () => {}),
        reply: vi.fn(async () => {}),
        followUp: vi.fn(async () => {}),
        editMessage: vi.fn(async () => {}),
        clearComponents: vi.fn(async () => {}),
      },
    };

    const first = await dispatchPluginInteractiveHandler(baseParams);
    const duplicate = await dispatchPluginInteractiveHandler(baseParams);

    expect(first).toEqual({ matched: true, handled: true, duplicate: false });
    expect(duplicate).toEqual({ matched: true, handled: true, duplicate: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "discord",
        conversationId: "channel-1",
        interaction: expect.objectContaining({
          namespace: "codex",
          payload: "approve:thread-1",
          messageId: "message-1",
          values: ["allow"],
        }),
      }),
    );
  });

  it("does not consume dedupe keys when a handler throws", async () => {
    const handler = vi
      .fn(async () => ({ handled: true }))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ handled: true });
    expect(
      registerPluginInteractiveHandler("codex-plugin", {
        channel: "telegram",
        namespace: "codex",
        handler,
      }),
    ).toEqual({ ok: true });

    const baseParams = {
      channel: "telegram" as const,
      data: "codex:resume:thread-1",
      callbackId: "cb-throw",
      ctx: {
        accountId: "default",
        callbackId: "cb-throw",
        conversationId: "-10099:topic:77",
        parentConversationId: "-10099",
        senderId: "user-1",
        senderUsername: "ada",
        threadId: 77,
        isGroup: true,
        isForum: true,
        auth: { isAuthorizedSender: true },
        callbackMessage: {
          messageId: 55,
          chatId: "-10099",
          messageText: "Pick a thread",
        },
      },
      respond: {
        reply: vi.fn(async () => {}),
        editMessage: vi.fn(async () => {}),
        editButtons: vi.fn(async () => {}),
        clearButtons: vi.fn(async () => {}),
        deleteMessage: vi.fn(async () => {}),
      },
    };

    await expect(dispatchPluginInteractiveHandler(baseParams)).rejects.toThrow("boom");
    await expect(dispatchPluginInteractiveHandler(baseParams)).resolves.toEqual({
      matched: true,
      handled: true,
      duplicate: false,
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not share dedupe keys across channels", async () => {
    const telegramHandler = vi.fn(async () => ({ handled: true }));
    const discordHandler = vi.fn(async () => ({ handled: true }));
    expect(
      registerPluginInteractiveHandler("codex-plugin", {
        channel: "telegram",
        namespace: "codex",
        handler: telegramHandler,
      }),
    ).toEqual({ ok: true });
    expect(
      registerPluginInteractiveHandler("codex-plugin", {
        channel: "discord",
        namespace: "codex",
        handler: discordHandler,
      }),
    ).toEqual({ ok: true });

    const telegramResult = await dispatchPluginInteractiveHandler({
      channel: "telegram",
      data: "codex:resume",
      callbackId: "same-id",
      ctx: {
        accountId: "default",
        callbackId: "same-id",
        conversationId: "chat-1",
        senderId: "user-1",
        senderUsername: "ada",
        isGroup: false,
        isForum: false,
        auth: { isAuthorizedSender: true },
        callbackMessage: {
          messageId: 1,
          chatId: "chat-1",
        },
      },
      respond: {
        reply: vi.fn(async () => {}),
        editMessage: vi.fn(async () => {}),
        editButtons: vi.fn(async () => {}),
        clearButtons: vi.fn(async () => {}),
        deleteMessage: vi.fn(async () => {}),
      },
    });
    const discordResult = await dispatchPluginInteractiveHandler({
      channel: "discord",
      data: "codex:resume",
      interactionId: "same-id",
      ctx: {
        accountId: "default",
        interactionId: "same-id",
        conversationId: "channel-1",
        senderId: "user-1",
        senderUsername: "ada",
        auth: { isAuthorizedSender: true },
        interaction: {
          kind: "button",
        },
      },
      respond: {
        acknowledge: vi.fn(async () => {}),
        reply: vi.fn(async () => {}),
        followUp: vi.fn(async () => {}),
        editMessage: vi.fn(async () => {}),
        clearComponents: vi.fn(async () => {}),
      },
    });

    expect(telegramResult).toEqual({ matched: true, handled: true, duplicate: false });
    expect(discordResult).toEqual({ matched: true, handled: true, duplicate: false });
    expect(telegramHandler).toHaveBeenCalledTimes(1);
    expect(discordHandler).toHaveBeenCalledTimes(1);
  });

  it("does not consume dedupe keys when a handler declines", async () => {
    const handler = vi
      .fn(async () => ({ handled: false }))
      .mockResolvedValueOnce({ handled: false })
      .mockResolvedValueOnce({ handled: true });
    expect(
      registerPluginInteractiveHandler("codex-plugin", {
        channel: "discord",
        namespace: "codex",
        handler,
      }),
    ).toEqual({ ok: true });

    const baseParams = {
      channel: "discord" as const,
      data: "codex:approve:thread-1",
      interactionId: "ix-decline",
      ctx: {
        accountId: "default",
        interactionId: "ix-decline",
        conversationId: "channel-1",
        senderId: "user-1",
        senderUsername: "ada",
        auth: { isAuthorizedSender: true },
        interaction: {
          kind: "button" as const,
        },
      },
      respond: {
        acknowledge: vi.fn(async () => {}),
        reply: vi.fn(async () => {}),
        followUp: vi.fn(async () => {}),
        editMessage: vi.fn(async () => {}),
        clearComponents: vi.fn(async () => {}),
      },
    };

    await expect(dispatchPluginInteractiveHandler(baseParams)).resolves.toEqual({
      matched: true,
      handled: false,
      duplicate: false,
    });
    await expect(dispatchPluginInteractiveHandler(baseParams)).resolves.toEqual({
      matched: true,
      handled: true,
      duplicate: false,
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
