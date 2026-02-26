import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../pi-model-discovery.js", () => ({
  discoverAuthStorage: vi.fn(() => ({ mocked: true })),
  discoverModels: vi.fn(() => ({ find: vi.fn(() => null) })),
}));

import { buildInlineProviderModels, resolveModel } from "./model.js";
import {
  buildOpenAICodexForwardCompatExpectation,
  makeModel,
  mockDiscoveredModel,
  mockOpenAICodexTemplateModel,
  resetMockDiscoverModels,
} from "./model.test-harness.js";

beforeEach(() => {
  resetMockDiscoverModels();
});

describe("pi embedded model e2e smoke", () => {
  it("attaches provider ids and provider-level baseUrl for inline models", () => {
    const providers = {
      custom: {
        baseUrl: "http://localhost:8000",
        models: [makeModel("custom-model")],
      },
    };

    const result = buildInlineProviderModels(providers);
    expect(result).toEqual([
      {
        ...makeModel("custom-model"),
        provider: "custom",
        baseUrl: "http://localhost:8000",
        api: undefined,
      },
    ]);
  });

  it("builds an openai-codex forward-compat fallback for gpt-5.3-codex", () => {
    mockOpenAICodexTemplateModel();

    const result = resolveModel("openai-codex", "gpt-5.3-codex", "/tmp/agent");
    expect(result.error).toBeUndefined();
    expect(result.model).toMatchObject(buildOpenAICodexForwardCompatExpectation("gpt-5.3-codex"));
  });

  it("builds a github-copilot forward-compat fallback for gpt-5.3-codex", () => {
    mockDiscoveredModel({
      provider: "github-copilot",
      modelId: "gpt-5.2-codex",
      templateModel: {
        id: "gpt-5.2-codex",
        name: "gpt-5.2-codex",
        provider: "github-copilot",
        api: "openai-responses",
        baseUrl: "https://api.individual.githubcopilot.com",
        reasoning: false,
        input: ["text", "image"] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    });

    const result = resolveModel("github-copilot", "gpt-5.3-codex", "/tmp/agent");
    expect(result.error).toBeUndefined();
    expect(result.model).toMatchObject({
      provider: "github-copilot",
      id: "gpt-5.3-codex",
      api: "openai-responses",
      baseUrl: "https://api.individual.githubcopilot.com",
    });
  });

  it("keeps unknown-model errors for non-forward-compat IDs", () => {
    const result = resolveModel("openai-codex", "gpt-4.1-mini", "/tmp/agent");
    expect(result.model).toBeUndefined();
    expect(result.error).toBe("Unknown model: openai-codex/gpt-4.1-mini");
  });
});
