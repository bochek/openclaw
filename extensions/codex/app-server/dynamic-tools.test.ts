import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AnyAgentTool } from "openclaw/plugin-sdk/agent-harness";
import { describe, expect, it, vi } from "vitest";
import { createCodexDynamicToolBridge } from "./dynamic-tools.js";

function createTool(overrides: Partial<AnyAgentTool>): AnyAgentTool {
  return {
    name: "tts",
    description: "Convert text to speech.",
    parameters: { type: "object", properties: {} },
    execute: vi.fn(),
    ...overrides,
  } as unknown as AnyAgentTool;
}

describe("createCodexDynamicToolBridge", () => {
  it("preserves structured media artifacts from tool results", async () => {
    const toolResult = {
      content: [{ type: "text", text: "Generated audio reply." }],
      details: {
        media: {
          mediaUrl: "/tmp/reply.opus",
          audioAsVoice: true,
        },
      },
    } satisfies AgentToolResult<unknown>;
    const tool = createTool({
      execute: vi.fn(async () => toolResult),
    });
    const bridge = createCodexDynamicToolBridge({
      tools: [tool],
      signal: new AbortController().signal,
    });

    const result = await bridge.handleToolCall({
      threadId: "thread-1",
      turnId: "turn-1",
      callId: "call-1",
      tool: "tts",
      arguments: { text: "hello" },
    });

    expect(result).toEqual({
      success: true,
      contentItems: [{ type: "inputText", text: "Generated audio reply." }],
    });
    expect(bridge.telemetry.toolMediaUrls).toEqual(["/tmp/reply.opus"]);
    expect(bridge.telemetry.toolAudioAsVoice).toBe(true);
  });
});
