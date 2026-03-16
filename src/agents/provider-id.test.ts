import { describe, expect, it } from "vitest";
import { normalizeProviderId, normalizeProviderIdForAuth } from "./provider-id.js";

describe("normalizeProviderId", () => {
  it("applies provider aliases without pulling heavier model-selection dependencies", () => {
    expect(normalizeProviderId("Anthropic")).toBe("anthropic");
    expect(normalizeProviderId("Z.ai")).toBe("zai");
    expect(normalizeProviderId("z-ai")).toBe("zai");
    expect(normalizeProviderId("OpenCode-Zen")).toBe("opencode");
    expect(normalizeProviderId("qwen")).toBe("qwen-portal");
    expect(normalizeProviderId("kimi-code")).toBe("kimi-coding");
    expect(normalizeProviderId("bedrock")).toBe("amazon-bedrock");
    expect(normalizeProviderId("aws-bedrock")).toBe("amazon-bedrock");
    expect(normalizeProviderId("doubao")).toBe("volcengine");
  });
});

describe("normalizeProviderIdForAuth", () => {
  it("maps coding-plan variants back to their base auth providers", () => {
    expect(normalizeProviderIdForAuth("volcengine-plan")).toBe("volcengine");
    expect(normalizeProviderIdForAuth("byteplus-plan")).toBe("byteplus");
    expect(normalizeProviderIdForAuth("anthropic")).toBe("anthropic");
  });
});
