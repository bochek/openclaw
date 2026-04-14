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
      }),
    ).toBeUndefined();
  });

  it("treats summary delivery responses as terminal", () => {
    expect(
      resolveOpenAIIntermediateAssistantAck({
        provider: "openai",
        modelId: "gpt-5.4",
        prompt: "Please inspect the repo and fix the failing test.",
        assistantText: "Let me summarize the findings: the last test failed on import order.",
        hasToolMessageInTranscript: false,
      }),
    ).toBeUndefined();
    expect(
      resolveOpenAIIntermediateAssistantAck({
        provider: "openai",
        modelId: "gpt-5.4",
        prompt: "Please inspect the repo and fix the failing test.",
        assistantText: "Let me summarize the findings. The last test failed on import order.",
        hasToolMessageInTranscript: false,
      }),
    ).toBeUndefined();
  });

  it("does not treat answer/result nouns as completion signals", () => {
    expect(
      resolveOpenAIIntermediateAssistantAck({
        provider: "openai",
        modelId: "gpt-5.4",
        prompt: "Please inspect the repo and fix the failing test.",
        assistantText: "Let me find the answer to the failing test in the repo.",
        hasToolMessageInTranscript: false,
      }),
    ).toEqual({
      instruction: expect.stringContaining("Continue now"),
    });
    expect(
      resolveOpenAIIntermediateAssistantAck({
        provider: "openai",
        modelId: "gpt-5.4",
        prompt: "Please inspect the repo and fix the failing test.",
        assistantText: "I'll check the result of the last run in the test workspace.",
        hasToolMessageInTranscript: false,
      }),
    ).toEqual({
      instruction: expect.stringContaining("Continue now"),
    });
  });

  it("ignores turns after prior tool activity", () => {
    expect(
      resolveOpenAIIntermediateAssistantAck({
        provider: "openai",
        modelId: "gpt-5.4",
        prompt: "Please inspect the repo and fix the failing test.",
        assistantText: "Let me inspect the repo and patch the failing test.",
        hasToolMessageInTranscript: true,
      }),
    ).toBeUndefined();
  });
});
