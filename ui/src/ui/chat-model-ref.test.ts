import { describe, expect, it } from "vitest";
import {
  buildChatModelOption,
  createChatModelOverride,
  formatChatModelDisplay,
  normalizeChatModelOverrideValue,
  resolvePreferredServerChatModelValue,
  resolveServerChatModelValue,
} from "./chat-model-ref.ts";
import type { ModelCatalogEntry } from "./types.ts";

const catalog: ModelCatalogEntry[] = [
  { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic" },
];

describe("chat-model-ref helpers", () => {
  it("builds provider-qualified option values and labels", () => {
    expect(buildChatModelOption(catalog[0])).toEqual({
      value: "openai/gpt-5-mini",
      label: "gpt-5-mini · openai",
    });
  });

  it("normalizes raw overrides when the catalog match is unique", () => {
    expect(normalizeChatModelOverrideValue(createChatModelOverride("gpt-5-mini"), catalog)).toBe(
      "openai/gpt-5-mini",
    );
  });

  it("keeps ambiguous raw overrides unchanged", () => {
    const ambiguousCatalog: ModelCatalogEntry[] = [
      { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai" },
      { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openrouter" },
    ];

    expect(
      normalizeChatModelOverrideValue(createChatModelOverride("gpt-5-mini"), ambiguousCatalog),
    ).toBe("gpt-5-mini");
  });

  it("formats qualified model refs consistently for default labels", () => {
    expect(formatChatModelDisplay("openai/gpt-5-mini")).toBe("gpt-5-mini · openai");
    expect(formatChatModelDisplay("alias-only")).toBe("alias-only");
  });

  it("resolves server session data to qualified option values", () => {
    expect(resolveServerChatModelValue("gpt-5-mini", "openai")).toBe("openai/gpt-5-mini");
    expect(resolveServerChatModelValue("alias-only", null)).toBe("alias-only");
  });

  it("prefers the catalog provider over a stale server provider when the match is unique", () => {
    expect(
      resolvePreferredServerChatModelValue("deepseek-chat", "zai", [
        { id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek" },
      ]),
    ).toBe("deepseek/deepseek-chat");
  });

  it("falls back to the server provider when the catalog is empty", () => {
    expect(resolvePreferredServerChatModelValue("gpt-5-mini", "openai", [])).toBe(
      "openai/gpt-5-mini",
    );
  });

  it("falls back to the server provider when the catalog match is ambiguous", () => {
    expect(
      resolvePreferredServerChatModelValue("gpt-5-mini", "openai", [
        { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai" },
        { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openrouter" },
      ]),
    ).toBe("openai/gpt-5-mini");
  });
});
