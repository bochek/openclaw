/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSendChat, refreshChatAvatar, type ChatHost } from "./app-chat.ts";

function makeHost(overrides?: Partial<ChatHost>): ChatHost {
  return {
    client: null,
    chatMessages: [],
    chatStream: null,
    connected: true,
    chatMessage: "",
    chatAttachments: [],
    chatQueue: [],
    chatRunId: null,
    chatSending: false,
    lastError: null,
    sessionKey: "agent:main",
    basePath: "",
    hello: null,
    chatAvatarUrl: null,
    chatModelOverrides: {},
    chatModelsLoading: false,
    chatModelCatalog: [],
    refreshSessionsAfterChat: new Set<string>(),
    updateComplete: Promise.resolve(),
    ...overrides,
  };
}

describe("refreshChatAvatar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a route-relative avatar endpoint before basePath bootstrap finishes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ avatarUrl: "/avatar/main" }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const host = makeHost({ basePath: "", sessionKey: "agent:main" });
    await refreshChatAvatar(host);

    expect(fetchMock).toHaveBeenCalledWith(
      "avatar/main?meta=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(host.chatAvatarUrl).toBe("/avatar/main");
  });

  it("keeps mounted dashboard avatar endpoints under the normalized base path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const host = makeHost({ basePath: "/openclaw/", sessionKey: "agent:ops:main" });
    await refreshChatAvatar(host);

    expect(fetchMock).toHaveBeenCalledWith(
      "/openclaw/avatar/ops?meta=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(host.chatAvatarUrl).toBeNull();
  });
});

describe("handleSendChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps slash-command model changes in sync with the chat header cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }) as unknown as typeof fetch,
    );
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === "sessions.patch") {
        return { ok: true, key: "main" };
      }
      if (method === "chat.history") {
        return { messages: [], thinkingLevel: null };
      }
      if (method === "sessions.list") {
        return {
          ts: 0,
          path: "",
          count: 0,
          defaults: { model: "gpt-5", contextTokens: null },
          sessions: [],
        };
      }
      if (method === "models.list") {
        return {
          models: [{ id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai" }],
        };
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    const host = makeHost({
      client: { request } as unknown as ChatHost["client"],
      sessionKey: "main",
      chatMessage: "/model gpt-5-mini",
    });

    await handleSendChat(host);

    expect(request).toHaveBeenCalledWith("sessions.patch", {
      key: "main",
      model: "gpt-5-mini",
    });
    expect(host.chatModelOverrides.main).toBe("gpt-5-mini");
  });

  it("sends /btw immediately while a run is active", async () => {
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === "chat.send") {
        return { runId: "run-btw", status: "started" };
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    const host = makeHost({
      client: { request } as unknown as ChatHost["client"],
      sessionKey: "main",
      chatRunId: "run-active",
      chatMessage: "/btw can you also check lint output?",
    });

    await handleSendChat(host);

    expect(request).toHaveBeenCalledWith("chat.send", {
      sessionKey: expect.stringMatching(/^agent:main:btw:/),
      message: [
        "Side-question mode: answer only this one question.",
        "Do not use tools.",
        "",
        "Question:",
        "can you also check lint output?",
      ].join("\n"),
      deliver: false,
      idempotencyKey: expect.any(String),
    });
    expect(host.chatQueue).toHaveLength(0);
    expect(host.chatRunId).toBe("run-active");
    expect(host.chatMessage).toBe("");
    expect(host.chatMessages.at(-1)).toEqual({
      role: "system",
      content: "Sent side question with `/btw`. I will post one answer here.",
      timestamp: expect.any(Number),
    });
  });

  it("includes recent visible chat context in /btw side questions", async () => {
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === "chat.send") {
        return { runId: "run-btw", status: "started" };
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    const host = makeHost({
      client: { request } as unknown as ChatHost["client"],
      sessionKey: "main",
      chatRunId: "run-active",
      chatStream: "I am editing commands-core.ts",
      chatMessage: "/btw what file are you editing?",
      chatMessages: [
        { role: "user", content: [{ type: "text", text: "continue with the btw command" }] },
        { role: "assistant", content: [{ type: "text", text: "I will implement it globally." }] },
      ],
    });

    await handleSendChat(host);

    expect(request).toHaveBeenCalledWith("chat.send", {
      sessionKey: expect.stringMatching(/^agent:main:btw:/),
      message: expect.stringContaining("Current session context (recent messages):"),
      deliver: false,
      idempotencyKey: expect.any(String),
    });
    const message = request.mock.calls[0]?.[1] as { message?: string };
    expect(message.message).toContain("user: continue with the btw command");
    expect(message.message).toContain("assistant: I will implement it globally.");
    expect(message.message).toContain("assistant (in-progress): I am editing commands-core.ts");
    expect(message.message).toContain("Question:");
    expect(message.message).toContain("what file are you editing?");
  });

  it("shows usage help for /btw without a message", async () => {
    const request = vi.fn();
    const host = makeHost({
      client: { request } as unknown as ChatHost["client"],
      chatMessage: "/btw",
    });

    await handleSendChat(host);

    expect(request).not.toHaveBeenCalled();
    expect(host.chatMessages.at(-1)).toEqual({
      role: "system",
      content: "Usage: `/btw <message>`",
      timestamp: expect.any(Number),
    });
  });
});
