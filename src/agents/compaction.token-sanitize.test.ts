import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chunkMessagesByMaxTokens,
  setCompactionTestDeps,
  splitMessagesByTokenShare,
} from "./compaction.js";

const mockEstimateTokens = vi.fn((_message: unknown) => 1);
const mockGenerateSummary = vi.fn(async () => "summary");

describe("compaction token accounting sanitization", () => {
  beforeEach(() => {
    mockEstimateTokens.mockReset();
    mockEstimateTokens.mockImplementation((_message: unknown) => 1);
    mockGenerateSummary.mockReset();
    mockGenerateSummary.mockResolvedValue("summary");
    setCompactionTestDeps({
      estimateTokens: mockEstimateTokens,
      generateSummary: mockGenerateSummary,
    });
  });

  afterEach(() => {
    setCompactionTestDeps(undefined);
  });

  it("does not pass toolResult.details into per-message token estimates", () => {
    const messages: AgentMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "browser",
        isError: false,
        content: [{ type: "text", text: "ok" }],
        details: { raw: "x".repeat(50_000) },
        timestamp: 1,
        // oxlint-disable-next-line typescript/no-explicit-any
      } as any,
      {
        role: "user",
        content: "next",
        timestamp: 2,
      },
    ];

    splitMessagesByTokenShare(messages, 2);
    chunkMessagesByMaxTokens(messages, 16);

    const calledWithDetails = mockEstimateTokens.mock.calls.some((call) => {
      const message = call[0] as { details?: unknown } | undefined;
      return Boolean(message?.details);
    });

    expect(calledWithDetails).toBe(false);
  });
});
