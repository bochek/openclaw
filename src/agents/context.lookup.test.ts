import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __testing as contextTesting,
  lookupContextTokens,
  resetContextWindowCacheForTest,
  resolveContextTokensForModel,
} from "./context.js";

type DiscoveredModel = { id: string; contextWindow: number };

function mockContextDeps(params: {
  loadConfig: () => unknown;
  discoveredModels?: DiscoveredModel[];
}) {
  const ensureOpenClawModelsJson = vi.fn(async () => {});
  contextTesting.setDepsForTest({
    loadConfig: params.loadConfig,
    ensureOpenClawModelsJson,
    resolveOpenClawAgentDir: () => "/tmp/openclaw-agent",
    loadDiscoveredModels: async () => params.discoveredModels ?? [],
  });
  return { ensureOpenClawModelsJson };
}

function mockContextModuleDeps(loadConfigImpl: () => unknown) {
  return mockContextDeps({ loadConfig: loadConfigImpl });
}

function mockDiscoveryDeps(
  models: DiscoveredModel[],
  configModels?: Record<string, { models: Array<{ id: string; contextWindow: number }> }>,
) {
  mockContextDeps({
    loadConfig: () => ({ models: configModels ? { providers: configModels } : {} }),
    discoveredModels: models,
  });
}

function createContextOverrideConfig(provider: string, model: string, contextWindow: number) {
  return {
    models: {
      providers: {
        [provider]: {
          models: [{ id: model, contextWindow }],
        },
      },
    },
  };
}

async function flushAsyncWarmup() {
  await Promise.resolve();
  await Promise.resolve();
}

async function importResolveContextTokensForModel() {
  await flushAsyncWarmup();
  return resolveContextTokensForModel;
}

describe("lookupContextTokens", () => {
  beforeEach(() => {
    resetContextWindowCacheForTest();
    contextTesting.setDepsForTest();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    resetContextWindowCacheForTest();
    contextTesting.setDepsForTest();
    await flushAsyncWarmup();
  });

  it("returns configured model context window on first lookup", () => {
    mockContextModuleDeps(() => ({
      models: {
        providers: {
          openrouter: {
            models: [{ id: "openrouter/claude-sonnet", contextWindow: 321_000 }],
          },
        },
      },
    }));

    expect(lookupContextTokens("openrouter/claude-sonnet")).toBe(321_000);
  });

  it("returns sync config overrides for read-only callers", () => {
    mockContextModuleDeps(() => ({
      models: {
        providers: {
          openrouter: {
            models: [{ id: "openrouter/claude-sonnet", contextWindow: 321_000 }],
          },
        },
      },
    }));

    expect(lookupContextTokens("openrouter/claude-sonnet", { allowAsyncLoad: false })).toBe(
      321_000,
    );
  });

  it("only warms eagerly for real openclaw startup commands that need model metadata", async () => {
    for (const scenario of [
      { argv: ["node", "openclaw", "chat"], expectedCalls: 1 },
      { argv: ["node", "openclaw", "--profile", "--", "config", "validate"], expectedCalls: 0 },
      { argv: ["node", "openclaw", "logs", "--limit", "5"], expectedCalls: 0 },
      { argv: ["node", "openclaw", "status", "--json"], expectedCalls: 0 },
      { argv: ["node", "scripts/test-built-plugin-singleton.mjs"], expectedCalls: 0 },
    ]) {
      resetContextWindowCacheForTest();
      contextTesting.setDepsForTest();
      const loadConfigMock = vi.fn(() => ({ models: {} }));
      const { ensureOpenClawModelsJson } = mockContextModuleDeps(loadConfigMock);
      contextTesting.runEagerWarmupForTest(scenario.argv);
      await flushAsyncWarmup();
      expect(loadConfigMock).toHaveBeenCalledTimes(scenario.expectedCalls);
      expect(ensureOpenClawModelsJson).toHaveBeenCalledTimes(scenario.expectedCalls);
    }
  });

  it("retries config loading after backoff when an initial load fails", async () => {
    vi.useFakeTimers();
    const loadConfigMock = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("transient");
      })
      .mockImplementation(() => ({
        models: {
          providers: {
            openrouter: {
              models: [{ id: "openrouter/claude-sonnet", contextWindow: 654_321 }],
            },
          },
        },
      }));

    mockContextModuleDeps(loadConfigMock);

    try {
      expect(lookupContextTokens("openrouter/claude-sonnet")).toBeUndefined();
      expect(loadConfigMock).toHaveBeenCalledTimes(1);
      expect(lookupContextTokens("openrouter/claude-sonnet")).toBeUndefined();
      expect(loadConfigMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(lookupContextTokens("openrouter/claude-sonnet")).toBe(654_321);
      expect(loadConfigMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the smaller window when the same bare model id is discovered under multiple providers", async () => {
    mockDiscoveryDeps([
      { id: "gemini-3.1-pro-preview", contextWindow: 1_048_576 },
      { id: "gemini-3.1-pro-preview", contextWindow: 128_000 },
    ]);

    lookupContextTokens("gemini-3.1-pro-preview");
    await flushAsyncWarmup();
    expect(lookupContextTokens("gemini-3.1-pro-preview")).toBe(128_000);
  });

  it("resolveContextTokensForModel returns discovery value when provider-qualified entry exists in cache", async () => {
    mockDiscoveryDeps([
      { id: "github-copilot/gemini-3.1-pro-preview", contextWindow: 128_000 },
      { id: "google-gemini-cli/gemini-3.1-pro-preview", contextWindow: 1_048_576 },
    ]);

    lookupContextTokens("google-gemini-cli/gemini-3.1-pro-preview");
    await flushAsyncWarmup();

    const result = resolveContextTokensForModel({
      provider: "google-gemini-cli",
      model: "gemini-3.1-pro-preview",
    });
    expect(result).toBe(1_048_576);
  });

  it("resolveContextTokensForModel returns configured override via direct config scan (beats discovery)", async () => {
    mockDiscoveryDeps([
      { id: "google-gemini-cli/gemini-3.1-pro-preview", contextWindow: 1_048_576 },
    ]);

    const cfg = createContextOverrideConfig("google-gemini-cli", "gemini-3.1-pro-preview", 200_000);
    const resolveContextTokensForModelLocal = await importResolveContextTokensForModel();

    const result = resolveContextTokensForModelLocal({
      cfg: cfg as never,
      provider: "google-gemini-cli",
      model: "gemini-3.1-pro-preview",
    });
    expect(result).toBe(200_000);
  });

  it("resolveContextTokensForModel honors configured overrides when provider keys use mixed case", async () => {
    mockDiscoveryDeps([{ id: "openrouter/anthropic/claude-sonnet-4-5", contextWindow: 1_048_576 }]);

    const cfg = createContextOverrideConfig(" OpenRouter ", "anthropic/claude-sonnet-4-5", 200_000);
    const resolveContextTokensForModelLocal = await importResolveContextTokensForModel();

    const result = resolveContextTokensForModelLocal({
      cfg: cfg as never,
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-5",
    });
    expect(result).toBe(200_000);
  });

  it("resolveContextTokensForModel: config direct scan prevents OpenRouter qualified key collision for Google provider", async () => {
    mockDiscoveryDeps([{ id: "google/gemini-2.5-pro", contextWindow: 999_000 }]);

    const cfg = createContextOverrideConfig("google", "gemini-2.5-pro", 2_000_000);
    lookupContextTokens("google/gemini-2.5-pro");
    await flushAsyncWarmup();

    const googleResult = resolveContextTokensForModel({
      cfg: cfg as never,
      provider: "google",
      model: "gemini-2.5-pro",
    });
    expect(googleResult).toBe(2_000_000);

    const openrouterResult = resolveContextTokensForModel({
      provider: "openrouter",
      model: "google/gemini-2.5-pro",
    });
    expect(openrouterResult).toBe(999_000);
  });

  it("resolveContextTokensForModel prefers exact provider key over alias-normalized match", async () => {
    mockDiscoveryDeps([]);

    const cfg = {
      models: {
        providers: {
          "amazon-bedrock": { models: [{ id: "claude-alias-test", contextWindow: 32_000 }] },
          bedrock: { models: [{ id: "claude-alias-test", contextWindow: 128_000 }] },
        },
      },
    };

    await flushAsyncWarmup();

    const bedrockResult = resolveContextTokensForModel({
      cfg: cfg as never,
      provider: "bedrock",
      model: "claude-alias-test",
    });
    expect(bedrockResult).toBe(128_000);

    const canonicalResult = resolveContextTokensForModel({
      cfg: cfg as never,
      provider: "amazon-bedrock",
      model: "claude-alias-test",
    });
    expect(canonicalResult).toBe(32_000);
  });

  it("resolveContextTokensForModel(model-only) does not apply config scan for inferred provider", async () => {
    mockDiscoveryDeps([{ id: "google/gemini-2.5-pro", contextWindow: 999_000 }]);

    const cfg = createContextOverrideConfig("google", "gemini-2.5-pro", 2_000_000);
    lookupContextTokens("google/gemini-2.5-pro");
    await flushAsyncWarmup();

    const modelOnlyResult = resolveContextTokensForModel({
      cfg: cfg as never,
      model: "google/gemini-2.5-pro",
    });
    expect(modelOnlyResult).toBe(999_000);

    const explicitResult = resolveContextTokensForModel({
      cfg: cfg as never,
      provider: "google",
      model: "gemini-2.5-pro",
    });
    expect(explicitResult).toBe(2_000_000);
  });

  it("resolveContextTokensForModel: qualified key beats bare min when provider is explicit (original #35976 fix)", async () => {
    mockDiscoveryDeps([
      { id: "github-copilot/gemini-3.1-pro-preview", contextWindow: 128_000 },
      { id: "gemini-3.1-pro-preview", contextWindow: 128_000 },
      { id: "google-gemini-cli/gemini-3.1-pro-preview", contextWindow: 1_048_576 },
    ]);

    lookupContextTokens("google-gemini-cli/gemini-3.1-pro-preview");
    await flushAsyncWarmup();

    const result = resolveContextTokensForModel({
      provider: "google-gemini-cli",
      model: "gemini-3.1-pro-preview",
    });
    expect(result).toBe(1_048_576);
  });

  it("resolveContextTokensForModel normalizes explicit provider aliases before config lookup", async () => {
    mockDiscoveryDeps([]);

    const cfg = createContextOverrideConfig("z.ai", "glm-5", 256_000);
    await flushAsyncWarmup();

    const result = resolveContextTokensForModel({
      cfg: cfg as never,
      provider: "z-ai",
      model: "glm-5",
    });
    expect(result).toBe(256_000);
  });
});
