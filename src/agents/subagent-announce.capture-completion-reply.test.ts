import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const chatHistoryMock = vi.fn<(sessionKey: string) => Promise<{ messages?: Array<unknown> }>>(
  async (_sessionKey: string) => ({ messages: [] }),
);

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(async (request: unknown) => {
    const typed = request as { method?: string; params?: { sessionKey?: string } };
    if (typed.method === "chat.history") {
      return await chatHistoryMock(typed.params?.sessionKey ?? "");
    }
    return {};
  }),
}));

describe("captureSubagentCompletionReply", () => {
  let previousFastTestEnv: string | undefined;
  let captureSubagentCompletionReply: (typeof import("./subagent-announce.js"))["captureSubagentCompletionReply"];

  beforeAll(async () => {
    previousFastTestEnv = process.env.OPENCLAW_TEST_FAST;
    process.env.OPENCLAW_TEST_FAST = "1";
    ({ captureSubagentCompletionReply } = await import("./subagent-announce.js"));
  });

  afterAll(() => {
    if (previousFastTestEnv === undefined) {
      delete process.env.OPENCLAW_TEST_FAST;
      return;
    }
    process.env.OPENCLAW_TEST_FAST = previousFastTestEnv;
  });

  beforeEach(() => {
    chatHistoryMock.mockReset().mockResolvedValue({ messages: [] });
  });

  afterEach(() => {
    try {
      vi.clearAllTimers();
      vi.useRealTimers();
    } catch {
      // Bun throws if fake timers were never activated in the test body.
    }
  });

  it("returns immediate assistant output from history without polling", async () => {
    chatHistoryMock.mockResolvedValueOnce({
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Immediate assistant completion" }],
        },
      ],
    });

    const result = await captureSubagentCompletionReply("agent:main:subagent:child");

    expect(result).toBe("Immediate assistant completion");
    expect(chatHistoryMock).toHaveBeenCalledTimes(1);
  });

  it("polls briefly and returns late tool output once available", async () => {
    chatHistoryMock
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({
        messages: [
          {
            role: "toolResult",
            content: [
              {
                type: "text",
                text: "Late tool result completion",
              },
            ],
          },
        ],
      });

    const result = await captureSubagentCompletionReply("agent:main:subagent:child");

    expect(result).toBe("Late tool result completion");
    expect(chatHistoryMock).toHaveBeenCalledTimes(3);
  });

  it("returns undefined when no completion output arrives before retry window closes", async () => {
    chatHistoryMock.mockResolvedValue({ messages: [] });

    const result = await captureSubagentCompletionReply("agent:main:subagent:child");

    expect(result).toBeUndefined();
    expect(chatHistoryMock).toHaveBeenCalled();
  });

  it("returns partial assistant progress when the latest assistant turn is tool-only", async () => {
    chatHistoryMock.mockResolvedValueOnce({
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Mapped the modules." },
            { type: "toolCall", id: "call-1", name: "read", arguments: {} },
          ],
        },
        {
          role: "assistant",
          content: [{ type: "toolCall", id: "call-2", name: "exec", arguments: {} }],
        },
      ],
    });

    const result = await captureSubagentCompletionReply("agent:main:subagent:child");

    expect(result).toBe("Mapped the modules.");
  });
});
