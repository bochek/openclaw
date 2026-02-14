import { describe, expect, it } from "vitest";
import { requiresReasoningTags } from "./provider-utils.js";

describe("requiresReasoningTags", () => {
  it("returns false for ollama - native reasoning field, no tags needed (#2279)", () => {
    expect(requiresReasoningTags("ollama")).toBe(false);
    expect(requiresReasoningTags("Ollama")).toBe(false);
  });

  it("returns true for google-gemini-cli", () => {
    expect(requiresReasoningTags("google-gemini-cli")).toBe(true);
  });

  it("returns true for google-generative-ai", () => {
    expect(requiresReasoningTags("google-generative-ai")).toBe(true);
  });

  it("returns true for google-antigravity", () => {
    expect(requiresReasoningTags("google-antigravity")).toBe(true);
    expect(requiresReasoningTags("google-antigravity/gemini-3")).toBe(true);
  });

  it("returns true for minimax", () => {
    expect(requiresReasoningTags("minimax")).toBe(true);
    expect(requiresReasoningTags("minimax-cn")).toBe(true);
  });

  it("returns false for null/undefined/empty", () => {
    expect(requiresReasoningTags(null)).toBe(false);
    expect(requiresReasoningTags(undefined)).toBe(false);
    expect(requiresReasoningTags("")).toBe(false);
  });

  it("returns false for standard providers", () => {
    expect(requiresReasoningTags("anthropic")).toBe(false);
    expect(requiresReasoningTags("openai")).toBe(false);
    expect(requiresReasoningTags("openrouter")).toBe(false);
  });

  it("does not match substrings", () => {
    expect(requiresReasoningTags("notgoogle-antigravity")).toBe(false);
    expect(requiresReasoningTags("foo-minimax")).toBe(false);
  });
});
