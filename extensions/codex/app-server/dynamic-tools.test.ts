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
  it.each([
    { toolName: "tts", mediaUrl: "/tmp/reply.opus", audioAsVoice: true },
    { toolName: "image_generate", mediaUrl: "/tmp/generated.png" },
    { toolName: "video_generate", mediaUrl: "https://media.example/video.mp4" },
    { toolName: "music_generate", mediaUrl: "https://media.example/music.wav" },
  ])(
    "preserves structured media artifacts from $toolName tool results",
    async ({ toolName, mediaUrl, audioAsVoice }) => {
      const toolResult = {
        content: [{ type: "text", text: "Generated media reply." }],
        details: {
          media: {
            mediaUrl,
            ...(audioAsVoice === true ? { audioAsVoice: true } : {}),
          },
        },
      } satisfies AgentToolResult<unknown>;
      const tool = createTool({
        name: toolName,
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
        tool: toolName,
        arguments: { prompt: "hello" },
      });

      expect(result).toEqual({
        success: true,
        contentItems: [{ type: "inputText", text: "Generated media reply." }],
      });
      expect(bridge.telemetry.toolMediaUrls).toEqual([mediaUrl]);
      expect(bridge.telemetry.toolAudioAsVoice).toBe(audioAsVoice === true);
    },
  );

  it("preserves audio-as-voice metadata from tts results", async () => {
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
