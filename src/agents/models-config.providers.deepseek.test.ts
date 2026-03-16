import { describe, expect, it } from "vitest";
import { buildDeepSeekProvider } from "./models-config.providers.static.js";

describe("DeepSeek provider", () => {
  it("should build deepseek provider with correct configuration", () => {
    const provider = buildDeepSeekProvider();
    expect(provider.baseUrl).toBe("https://api.deepseek.com");
    expect(provider.api).toBe("openai-completions");
    expect(provider.models).toBeDefined();
    expect(provider.models.length).toBeGreaterThan(0);
  });

  it("should include both deepseek-chat and deepseek-reasoner models", () => {
    const provider = buildDeepSeekProvider();
    const modelIds = provider.models.map((m) => m.id);
    expect(modelIds).toContain("deepseek-chat");
    expect(modelIds).toContain("deepseek-reasoner");
  });

  it("should mark deepseek-reasoner as a reasoning model", () => {
    const provider = buildDeepSeekProvider();
    const reasoner = provider.models.find((m) => m.id === "deepseek-reasoner");
    const chat = provider.models.find((m) => m.id === "deepseek-chat");
    expect(reasoner?.reasoning).toBe(true);
    expect(chat?.reasoning).toBe(false);
  });
});
