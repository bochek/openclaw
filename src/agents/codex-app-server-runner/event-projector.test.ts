import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { EmbeddedRunAttemptParams } from "../pi-embedded-runner/run/types.js";
import { CodexAppServerEventProjector } from "./event-projector.js";

function createParams(): EmbeddedRunAttemptParams {
  return {
    prompt: "hello",
    sessionId: "session-1",
    provider: "openai-codex",
    modelId: "gpt-5.4-codex",
    model: {
      id: "gpt-5.4-codex",
      name: "gpt-5.4-codex",
      provider: "openai-codex",
      api: "openai-codex-responses",
      input: ["text"],
      reasoning: true,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 8_000,
    } as Model<Api>,
    thinkLevel: "medium",
  } as unknown as EmbeddedRunAttemptParams;
}

describe("CodexAppServerEventProjector", () => {
  it("projects assistant deltas and usage into embedded attempt results", async () => {
    const onAssistantMessageStart = vi.fn();
    const onPartialReply = vi.fn();
    const params = {
      ...createParams(),
      onAssistantMessageStart,
      onPartialReply,
    };
    const projector = new CodexAppServerEventProjector(params, "thread-1", "turn-1");

    await projector.handleNotification({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "msg-1", delta: "hel" },
    });
    await projector.handleNotification({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "msg-1", delta: "lo" },
    });
    await projector.handleNotification({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        tokenUsage: {
          total: {
            totalTokens: 12,
            inputTokens: 5,
            cachedInputTokens: 2,
            outputTokens: 7,
          },
        },
      },
    });
    await projector.handleNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        turn: {
          id: "turn-1",
          status: "completed",
          items: [{ type: "agentMessage", id: "msg-1", text: "hello" }],
        },
      },
    });

    const result = projector.buildResult({
      didSendViaMessagingTool: false,
      messagingToolSentTexts: [],
      messagingToolSentMediaUrls: [],
      messagingToolSentTargets: [],
    });

    expect(onAssistantMessageStart).toHaveBeenCalledTimes(1);
    expect(onPartialReply).toHaveBeenLastCalledWith({ text: "hello" });
    expect(result.assistantTexts).toEqual(["hello"]);
    expect(result.lastAssistant?.content).toEqual([{ type: "text", text: "hello" }]);
    expect(result.attemptUsage).toMatchObject({ input: 5, output: 7, cacheRead: 2, total: 12 });
    expect(result.replayMetadata.replaySafe).toBe(true);
  });

  it("ignores notifications for other turns", async () => {
    const params = createParams();
    const projector = new CodexAppServerEventProjector(params, "thread-1", "turn-1");

    await projector.handleNotification({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-1", turnId: "turn-2", itemId: "msg-1", delta: "wrong" },
    });

    const result = projector.buildResult({
      didSendViaMessagingTool: false,
      messagingToolSentTexts: [],
      messagingToolSentMediaUrls: [],
      messagingToolSentTargets: [],
    });
    expect(result.assistantTexts).toEqual([]);
  });
});
