import { describe, expect, it } from "vitest";
import { resolveOpenAIIntermediateAssistantAck } from "./intermediate-ack.js";

describe("resolveOpenAIIntermediateAssistantAck", () => {
  it("detects a lightweight workspace acknowledgement that promises action", () => {
    expect(
      resolveOpenAIIntermediateAssistantAck({
        provider: "openai",
        modelId: "gpt-5.4",
        prompt: "Please inspect the repo and fix the failing test.",
        assistantText: "Let me inspect the repo and patch the failing test.",
        hasToolMessageInTranscript: false,
        isFirstAssistantTurnInTranscript: true,
      }),
    ).toEqual({
      instruction: expect.stringContaining("Continue now"),
    });
  });

  it("ignores optional offer phrasing", () => {
    expect(
      resolveOpenAIIntermediateAssistantAck({
        provider: "openai",
        modelId: "gpt-5.4",
        prompt: "Please inspect the repo and fix the failing test.",
        assistantText: "If you want, I can do that.",
        hasToolMessageInTranscript: false,
        isFirstAssistantTurnInTranscript: true,
      }),
    ).toBeUndefined();
  });

  it("ignores completed answers", () => {
    expect(
      resolveOpenAIIntermediateAssistantAck({
        provider: "openai",
        modelId: "gpt-5.4",
        prompt: "Please inspect the repo and fix the failing test.",
        assistantText: "Done. I fixed the failing test.",
        hasToolMessageInTranscript: false,
        isFirstAssistantTurnInTranscript: true,
      }),
    ).toBeUndefined();
  });

  it("ignores follow-up assistant turns after prior tool activity", () => {
    expect(
      resolveOpenAIIntermediateAssistantAck({
        provider: "openai",
        modelId: "gpt-5.4",
        prompt: "Please inspect the repo and fix the failing test.",
        assistantText: "Let me inspect the repo and patch the failing test.",
        hasToolMessageInTranscript: true,
        isFirstAssistantTurnInTranscript: false,
      }),
    ).toBeUndefined();
  });
});
