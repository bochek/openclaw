import { describe, expect, it } from "vitest";
import { modelKey, parseModelRef } from "./model-ref.js";

describe("modelKey", () => {
  it("keeps canonical OpenRouter native ids without duplicating the provider", () => {
    expect(modelKey("openrouter", "openrouter/hunter-alpha")).toBe("openrouter/hunter-alpha");
  });
});

describe("parseModelRef", () => {
  it("uses the default provider when omitted", () => {
    expect(parseModelRef("claude-3-5-sonnet", "anthropic")).toEqual({
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    });
  });

  it("normalizes anthropic shorthand aliases", () => {
    expect(parseModelRef("anthropic/opus-4.6", "openai")).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-6",
    });
  });

  it("preserves nested model ids after the provider prefix", () => {
    expect(parseModelRef("nvidia/moonshotai/kimi-k2.5", "anthropic")).toEqual({
      provider: "nvidia",
      model: "moonshotai/kimi-k2.5",
    });
  });

  it("normalizes OpenRouter-native model refs without duplicating the provider", () => {
    expect(parseModelRef("openrouter/hunter-alpha", "anthropic")).toEqual({
      provider: "openrouter",
      model: "openrouter/hunter-alpha",
    });
  });
});
