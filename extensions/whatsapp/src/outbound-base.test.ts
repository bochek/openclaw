import { describe, expect, it, vi } from "vitest";
import { createWhatsAppPollFixture, expectWhatsAppPollSent } from "../contract-api.js";
import { createWhatsAppOutboundBase } from "./outbound-base.js";

describe("createWhatsAppOutboundBase", () => {
  it("exposes the provided chunker", () => {
    const outbound = createWhatsAppOutboundBase({
      chunker: (text, limit) => [text.slice(0, limit)],
      sendMessageWhatsApp: vi.fn(),
      sendPollWhatsApp: vi.fn(),
      shouldLogVerbose: () => false,
      resolveTarget: ({ to }) => ({ ok: true as const, to: to ?? "" }),
    });

    expect(outbound.chunker?.("alpha beta", 5)).toEqual(["alpha"]);
  });

  it("forwards mediaLocalRoots to sendMessageWhatsApp", async () => {
    const sendMessageWhatsApp = vi.fn(async () => ({
      messageId: "msg-1",
      toJid: "15551234567@s.whatsapp.net",
    }));
    const outbound = createWhatsAppOutboundBase({
      chunker: (text) => [text],
      sendMessageWhatsApp,
      sendPollWhatsApp: vi.fn(),
      shouldLogVerbose: () => false,
      resolveTarget: ({ to }) => ({ ok: true as const, to: to ?? "" }),
    });
    const mediaLocalRoots = ["/tmp/workspace"];

    const result = await outbound.sendMedia!({
      cfg: {} as never,
      to: "whatsapp:+15551234567",
      text: "photo",
      mediaUrl: "/tmp/workspace/photo.png",
      mediaLocalRoots,
      accountId: "default",
      deps: { sendWhatsApp: sendMessageWhatsApp },
      gifPlayback: false,
    });

    expect(sendMessageWhatsApp).toHaveBeenCalledWith(
      "whatsapp:+15551234567",
      "photo",
      expect.objectContaining({
        verbose: false,
        mediaUrl: "/tmp/workspace/photo.png",
        mediaLocalRoots,
        accountId: "default",
        gifPlayback: false,
      }),
    );
    expect(result).toMatchObject({ channel: "whatsapp", messageId: "msg-1" });
  });

  it("threads cfg into sendPollWhatsApp call", async () => {
    const sendPollWhatsApp = vi.fn(async () => ({
      messageId: "wa-poll-1",
      toJid: "1555@s.whatsapp.net",
    }));
    const outbound = createWhatsAppOutboundBase({
      chunker: (text) => [text],
      sendMessageWhatsApp: vi.fn(),
      sendPollWhatsApp,
      shouldLogVerbose: () => false,
      resolveTarget: ({ to }) => ({ ok: true as const, to: to ?? "" }),
    });
    const { cfg, poll, to, accountId } = createWhatsAppPollFixture();

    const result = await outbound.sendPoll!({
      cfg,
      to,
      poll,
      accountId,
    });

    expectWhatsAppPollSent(sendPollWhatsApp, { cfg, poll, to, accountId });
    expect(result).toEqual({
      channel: "whatsapp",
      messageId: "wa-poll-1",
      toJid: "1555@s.whatsapp.net",
    });
  });
});

describe("createWhatsAppOutboundBase reply quoting", () => {
  it("forwards replyToId as quotedMessageKey on outbound sends", async () => {
    const sendWhatsApp = vi.fn(async () => ({
      messageId: "msg-1",
      toJid: "15551234567@s.whatsapp.net",
    }));

    const outbound = createWhatsAppOutboundBase({
      chunker: (text) => [text],
      sendMessageWhatsApp: sendWhatsApp,
      sendPollWhatsApp: vi.fn(),
      shouldLogVerbose: () => false,
      resolveTarget: ({ to }) => ({ ok: true as const, to: to ?? "" }),
      resolveReplyToMode: () => "all",
    });

    await outbound.sendText!({
      cfg: {} as never,
      to: "whatsapp:+15551234567",
      text: "reply",
      replyToId: "quoted-1",
      accountId: "default",
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledWith(
      "whatsapp:+15551234567",
      "reply",
      expect.objectContaining({
        accountId: "default",
        quotedMessageKey: {
          id: "quoted-1",
          remoteJid: "15551234567@s.whatsapp.net",
          fromMe: false,
        },
        verbose: false,
      }),
    );
  });

  it("forwards replyToParticipant as quotedMessageKey participant on group sends", async () => {
    const sendWhatsApp = vi.fn(async () => ({
      messageId: "msg-1",
      toJid: "120363000000000000@g.us",
    }));

    const outbound = createWhatsAppOutboundBase({
      chunker: (text) => [text],
      sendMessageWhatsApp: sendWhatsApp,
      sendPollWhatsApp: vi.fn(),
      shouldLogVerbose: () => false,
      resolveTarget: ({ to }) => ({ ok: true as const, to: to ?? "" }),
      resolveReplyToMode: () => "all",
    });

    await outbound.sendText!({
      cfg: {} as never,
      to: "120363000000000000@g.us",
      text: "reply",
      replyToId: "quoted-1",
      replyToParticipant: "+15551234567",
      accountId: "default",
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledWith(
      "120363000000000000@g.us",
      "reply",
      expect.objectContaining({
        quotedMessageKey: {
          id: "quoted-1",
          remoteJid: "120363000000000000@g.us",
          fromMe: false,
          participant: "15551234567@s.whatsapp.net",
        },
        verbose: false,
      }),
    );
  });

  it("quotes only the first chunk on sendFormattedText when replyToMode is first", async () => {
    const sendWhatsApp = vi.fn(
      async (_to: string, _text: string, _options: { quotedMessageKey?: unknown }) => ({
        messageId: "msg-1",
        toJid: "15551234567@s.whatsapp.net",
      }),
    );

    const outbound = createWhatsAppOutboundBase({
      chunker: (text, limit) => {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += limit) {
          chunks.push(text.slice(i, i + limit));
        }
        return chunks;
      },
      sendMessageWhatsApp: sendWhatsApp,
      sendPollWhatsApp: vi.fn(),
      shouldLogVerbose: () => false,
      resolveTarget: ({ to }) => ({ ok: true as const, to: to ?? "" }),
      resolveReplyToMode: () => "first",
    });

    const cfg = {
      channels: {
        whatsapp: {
          replyToMode: "first",
          textChunkLimit: 3,
        },
      },
    } as unknown as import("openclaw/plugin-sdk/config-runtime").OpenClawConfig;

    await outbound.sendFormattedText!({
      cfg,
      to: "whatsapp:+15551234567",
      text: "aaaaaa",
      replyToId: "quoted-1",
      accountId: "default",
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(sendWhatsApp).toHaveBeenNthCalledWith(
      1,
      "whatsapp:+15551234567",
      "aaa",
      expect.objectContaining({
        quotedMessageKey: expect.objectContaining({ id: "quoted-1" }),
      }),
    );
    expect(sendWhatsApp).toHaveBeenNthCalledWith(
      2,
      "whatsapp:+15551234567",
      "aaa",
      expect.not.objectContaining({
        quotedMessageKey: expect.anything(),
      }),
    );
  });

  it("stops formatted chunk sending after abort", async () => {
    const abortController = new AbortController();
    const sendWhatsApp = vi.fn(
      async (_to: string, _text: string, _options: { quotedMessageKey?: unknown }) => {
        abortController.abort();
        return {
          messageId: "msg-1",
          toJid: "15551234567@s.whatsapp.net",
        };
      },
    );

    const outbound = createWhatsAppOutboundBase({
      chunker: (text, limit) => {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += limit) {
          chunks.push(text.slice(i, i + limit));
        }
        return chunks;
      },
      sendMessageWhatsApp: sendWhatsApp,
      sendPollWhatsApp: vi.fn(),
      shouldLogVerbose: () => false,
      resolveTarget: ({ to }) => ({ ok: true as const, to: to ?? "" }),
    });

    const cfg = {
      channels: {
        whatsapp: {
          textChunkLimit: 3,
        },
      },
    } as unknown as import("openclaw/plugin-sdk/config-runtime").OpenClawConfig;

    await expect(
      outbound.sendFormattedText!({
        cfg,
        to: "whatsapp:+15551234567",
        text: "aaaaaa",
        accountId: "default",
        deps: { sendWhatsApp },
        abortSignal: abortController.signal,
      }),
    ).rejects.toThrow("Operation aborted");

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(sendWhatsApp).toHaveBeenNthCalledWith(
      1,
      "whatsapp:+15551234567",
      "aaa",
      expect.any(Object),
    );
  });

  it("does not set quotedMessageKey when replyToMode is off", async () => {
    const sendWhatsApp = vi.fn(async () => ({
      messageId: "msg-1",
      toJid: "15551234567@s.whatsapp.net",
    }));

    const outbound = createWhatsAppOutboundBase({
      chunker: (text) => [text],
      sendMessageWhatsApp: sendWhatsApp,
      sendPollWhatsApp: vi.fn(),
      shouldLogVerbose: () => false,
      resolveTarget: ({ to }) => ({ ok: true as const, to: to ?? "" }),
      resolveReplyToMode: () => "off",
    });

    await outbound.sendText!({
      cfg: {} as never,
      to: "whatsapp:+15551234567",
      text: "reply",
      replyToId: "quoted-1",
      accountId: "default",
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledWith(
      "whatsapp:+15551234567",
      "reply",
      expect.objectContaining({
        quotedMessageKey: undefined,
      }),
    );
  });

  it("consumeReplyToAfterFirstMediaSend returns true when mode is first", () => {
    const outbound = createWhatsAppOutboundBase({
      chunker: (text) => [text],
      sendMessageWhatsApp: vi.fn(),
      sendPollWhatsApp: vi.fn(),
      shouldLogVerbose: () => false,
      resolveTarget: ({ to }) => ({ ok: true as const, to: to ?? "" }),
      resolveReplyToMode: () => "first",
    });

    expect(
      outbound.consumeReplyToAfterFirstMediaSend!({
        cfg: {} as never,
        accountId: "default",
      }),
    ).toBe(true);
  });
});
