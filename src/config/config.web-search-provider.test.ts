import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBundledBraveSearchProvider } from "../../extensions/search-brave/src/provider.js";
import { createBundledGeminiSearchProvider } from "../../extensions/search-gemini/src/provider.js";
import { createBundledGrokSearchProvider } from "../../extensions/search-grok/src/provider.js";
import { createBundledKimiSearchProvider } from "../../extensions/search-kimi/src/provider.js";
import { createBundledPerplexitySearchProvider } from "../../extensions/search-perplexity/src/provider.js";
import { validateConfigObject, validateConfigObjectWithPlugins } from "./config.js";
import { buildWebSearchProviderConfig } from "./test-helpers.js";

const loadOpenClawPlugins = vi.hoisted(() => vi.fn(() => ({ searchProviders: [] as unknown[] })));

vi.mock("../runtime.js", () => ({
  defaultRuntime: { log: vi.fn(), error: vi.fn() },
}));

vi.mock("../plugins/loader.js", () => ({
  loadOpenClawPlugins,
}));

vi.mock("@mariozechner/pi-ai/oauth", () => ({
  getOAuthApiKey: vi.fn(async () => null),
  getOAuthProviders: () => [],
}));

const { __testing } = await import("../agents/tools/web-search.js");
const { resolveSearchProvider } = __testing;

const bundledSearchProviders = [
  { pluginId: "search-brave", provider: createBundledBraveSearchProvider() },
  { pluginId: "search-gemini", provider: createBundledGeminiSearchProvider() },
  { pluginId: "search-grok", provider: createBundledGrokSearchProvider() },
  { pluginId: "search-kimi", provider: createBundledKimiSearchProvider() },
  { pluginId: "search-perplexity", provider: createBundledPerplexitySearchProvider() },
];

function resolveSearchProviderId(search: Record<string, unknown>) {
  return resolveSearchProvider({
    config: {
      tools: {
        web: {
          search,
        },
      },
    },
  }).id;
}

describe("web search provider config", () => {
  beforeEach(() => {
    loadOpenClawPlugins.mockReset();
    loadOpenClawPlugins.mockReturnValue({ searchProviders: [] });
  });

  it("accepts custom plugin provider ids", () => {
    const res = validateConfigObject(
      buildWebSearchProviderConfig({
        provider: "searxng",
      }),
    );

    expect(res.ok).toBe(true);
  });

  it("rejects unknown custom plugin provider ids during plugin-aware validation", () => {
    const res = validateConfigObjectWithPlugins(
      buildWebSearchProviderConfig({
        provider: "brvae",
      }),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path === "tools.web.search.provider")).toBe(true);
    }
  });

  it("accepts registered custom plugin provider ids during plugin-aware validation", () => {
    loadOpenClawPlugins.mockReturnValue({
      searchProviders: [
        {
          provider: {
            id: "searxng",
          },
        },
      ],
    });

    const res = validateConfigObjectWithPlugins(
      buildWebSearchProviderConfig({
        provider: "searxng",
      }),
    );

    expect(res.ok).toBe(true);
  });

  it("surfaces plugin loading failures during plugin-aware validation", () => {
    loadOpenClawPlugins.mockImplementation(() => {
      throw new Error("plugin import failed");
    });

    const res = validateConfigObjectWithPlugins(
      buildWebSearchProviderConfig({
        provider: "searxng",
      }),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(
        res.issues.some(
          (issue) =>
            issue.path === "tools.web.search.provider" &&
            issue.message.includes("plugin loading failed") &&
            issue.message.includes("plugin import failed"),
        ),
      ).toBe(true);
    }
  });

  it("rejects invalid custom plugin provider ids", () => {
    const res = validateConfigObject(
      buildWebSearchProviderConfig({
        provider: "SearXNG!",
      }),
    );

    expect(res.ok).toBe(false);
  });

  it("accepts perplexity provider and config", () => {
    const res = validateConfigObject(
      buildWebSearchProviderConfig({
        enabled: true,
        provider: "perplexity",
        providerConfig: {
          apiKey: "test-key", // pragma: allowlist secret
          baseUrl: "https://openrouter.ai/api/v1",
          model: "perplexity/sonar-pro",
        },
      }),
    );

    expect(res.ok).toBe(true);
  });

  it("accepts gemini provider and config", () => {
    const res = validateConfigObject(
      buildWebSearchProviderConfig({
        enabled: true,
        provider: "gemini",
        providerConfig: {
          apiKey: "test-key", // pragma: allowlist secret
          model: "gemini-2.5-flash",
        },
      }),
    );

    expect(res.ok).toBe(true);
  });

  it("accepts gemini provider with no extra config", () => {
    const res = validateConfigObject(
      buildWebSearchProviderConfig({
        provider: "gemini",
      }),
    );

    expect(res.ok).toBe(true);
  });

  it("accepts brave llm-context mode config", () => {
    const res = validateConfigObject(
      buildWebSearchProviderConfig({
        provider: "brave",
        providerConfig: {
          mode: "llm-context",
        },
      }),
    );

    expect(res.ok).toBe(true);
  });

  it("rejects invalid brave mode config values", () => {
    const res = validateConfigObject(
      buildWebSearchProviderConfig({
        provider: "brave",
        providerConfig: {
          mode: "invalid-mode",
        },
      }),
    );

    expect(res.ok).toBe(false);
  });
});

describe("web search provider auto-detection", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    loadOpenClawPlugins.mockReset();
    loadOpenClawPlugins.mockReturnValue({ searchProviders: bundledSearchProviders });
    delete process.env.BRAVE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.MOONSHOT_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.MOONSHOT_API_KEY;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.restoreAllMocks();
  });

  it("falls back to brave when no keys available", () => {
    expect(resolveSearchProviderId({})).toBe("brave");
  });

  it("auto-detects brave when only BRAVE_API_KEY is set", () => {
    process.env.BRAVE_API_KEY = "test-brave-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("brave");
  });

  it("auto-detects gemini when only GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-gemini-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("gemini");
  });

  it("auto-detects kimi when only KIMI_API_KEY is set", () => {
    process.env.KIMI_API_KEY = "test-kimi-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("kimi");
  });

  it("auto-detects perplexity when only PERPLEXITY_API_KEY is set", () => {
    process.env.PERPLEXITY_API_KEY = "test-perplexity-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("perplexity");
  });

  it("auto-detects perplexity when only OPENROUTER_API_KEY is set", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("perplexity");
  });

  it("auto-detects grok when only XAI_API_KEY is set", () => {
    process.env.XAI_API_KEY = "test-xai-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("grok");
  });

  it("auto-detects kimi when only KIMI_API_KEY is set", () => {
    process.env.KIMI_API_KEY = "test-kimi-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("kimi");
  });

  it("auto-detects kimi when only MOONSHOT_API_KEY is set", () => {
    process.env.MOONSHOT_API_KEY = "test-moonshot-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("kimi");
  });

  it("follows alphabetical order — brave wins when multiple keys available", () => {
    process.env.BRAVE_API_KEY = "test-brave-key"; // pragma: allowlist secret
    process.env.GEMINI_API_KEY = "test-gemini-key"; // pragma: allowlist secret
    process.env.PERPLEXITY_API_KEY = "test-perplexity-key"; // pragma: allowlist secret
    process.env.XAI_API_KEY = "test-xai-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("brave");
  });

  it("gemini wins over grok, kimi, and perplexity when brave unavailable", () => {
    process.env.GEMINI_API_KEY = "test-gemini-key"; // pragma: allowlist secret
    process.env.PERPLEXITY_API_KEY = "test-perplexity-key"; // pragma: allowlist secret
    process.env.XAI_API_KEY = "test-xai-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("gemini");
  });

  it("grok wins over kimi and perplexity when brave and gemini unavailable", () => {
    process.env.XAI_API_KEY = "test-xai-key"; // pragma: allowlist secret
    process.env.KIMI_API_KEY = "test-kimi-key"; // pragma: allowlist secret
    process.env.PERPLEXITY_API_KEY = "test-perplexity-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({})).toBe("grok");
  });

  it("explicit provider always wins regardless of keys", () => {
    process.env.BRAVE_API_KEY = "test-brave-key"; // pragma: allowlist secret
    expect(resolveSearchProviderId({ provider: "gemini" })).toBe("gemini");
  });
});
