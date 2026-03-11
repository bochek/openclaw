import type { AssistantMessage } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "../infra/env.js";
import { createOpenAIWebSocketStreamFn, releaseWsSession } from "./openai-ws-stream.js";

const API_KEY = process.env.OPENAI_API_KEY ?? "";
const LIVE = isTruthyEnvValue(process.env.LIVE) || isTruthyEnvValue(process.env.OPENCLAW_LIVE_TEST);
const describeLive = LIVE && API_KEY ? describe : describe.skip;

type AssistantPhase = "commentary" | "final_answer";
type AssistantMessageWithPhase = AssistantMessage & { phase?: AssistantPhase };
type StreamFn = ReturnType<typeof createOpenAIWebSocketStreamFn>;
type StreamModel = Parameters<StreamFn>[0];
type StreamContext = Parameters<StreamFn>[1];
type StreamOptions = Parameters<StreamFn>[2];

const model = {
  api: "openai-responses" as const,
  provider: "openai",
  id: "gpt-5.2",
  name: "gpt-5.2",
  baseUrl: "https://api.openai.com/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
} as unknown as StreamModel;

const sessions: string[] = [];

function freshSession(name: string): string {
  const id = `live-ws-${name}-${Date.now()}`;
  sessions.push(id);
  return id;
}

function makeUserMessage(text: string) {
  return {
    role: "user" as const,
    content: text,
    timestamp: Date.now(),
  };
}

function makeContext(messages: StreamContext["messages"]): StreamContext {
  return {
    systemPrompt: "Reply with the exact requested text and nothing else.",
    messages,
    tools: [],
  } as StreamContext;
}

function extractText(message: AssistantMessage): string {
  return message.content
    .filter(
      (block): block is Extract<(typeof message.content)[number], { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("");
}

async function collectDoneEvent(
  stream: ReturnType<StreamFn>,
): Promise<{ reason: string; message: AssistantMessageWithPhase }> {
  for await (const event of stream as AsyncIterable<unknown>) {
    if (event && typeof event === "object" && (event as { type?: string }).type === "done") {
      return event as { reason: string; message: AssistantMessageWithPhase };
    }
    if (event && typeof event === "object" && (event as { type?: string }).type === "error") {
      const error = event as { error?: { errorMessage?: string } };
      throw new Error(error.error?.errorMessage ?? "OpenAI WS live test failed");
    }
  }
  throw new Error("stream ended without a terminal done event");
}

describeLive("openai-ws-stream (live)", () => {
  afterEach(() => {
    for (const id of sessions) {
      releaseWsSession(id);
    }
    sessions.length = 0;
  });

  it("replays seeded assistant phase on a second full-context websocket request", async () => {
    const sessionId = freshSession("phase-replay");
    const streamFn = createOpenAIWebSocketStreamFn(API_KEY, sessionId);

    const firstTurn = await collectDoneEvent(
      streamFn(model, makeContext([makeUserMessage("Reply with exactly FIRST-PHASE-OK.")]), {
        reasoningEffort: "low",
        maxTokens: 64,
      } as StreamOptions),
    );
    expect(extractText(firstTurn.message)).toContain("FIRST-PHASE-OK");

    const seededAssistant: AssistantMessageWithPhase = {
      role: "assistant",
      api: "openai-responses",
      provider: "openai",
      model: "gpt-5.2",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
      phase: "final_answer",
      content: [{ type: "text", text: "FIRST-PHASE-OK" }],
    };

    let secondPayload: Record<string, unknown> | undefined;
    const secondTurn = await collectDoneEvent(
      streamFn(
        model,
        makeContext([
          makeUserMessage("Reply with exactly FIRST-PHASE-OK."),
          seededAssistant,
          makeUserMessage("Reply with exactly SECOND-PHASE-OK."),
        ] as StreamContext["messages"]),
        {
          reasoningEffort: "low",
          maxTokens: 64,
          onPayload: (payload) => {
            secondPayload = payload as Record<string, unknown>;
          },
        } as StreamOptions,
      ),
    );
    expect(extractText(secondTurn.message)).toContain("SECOND-PHASE-OK");

    const input = Array.isArray(secondPayload?.input) ? secondPayload.input : [];
    const replayedAssistant = input.find(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).type === "message" &&
        (item as Record<string, unknown>).role === "assistant",
    );
    expect(replayedAssistant?.phase).toBe("final_answer");
  }, 60_000);
});
