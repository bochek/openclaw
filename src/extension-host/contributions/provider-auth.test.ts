import { describe, expect, it, vi } from "vitest";
import type { ProviderPlugin } from "../../plugins/types.js";
import {
  applyExtensionHostDefaultModel,
  mergeExtensionHostConfigPatch,
  pickExtensionHostAuthMethod,
  resolveExtensionHostProviderMatch,
} from "./provider-auth.js";

function makeProvider(overrides: Partial<ProviderPlugin> & Pick<ProviderPlugin, "id" | "label">) {
  return {
    auth: [],
    ...overrides,
  } satisfies ProviderPlugin;
}

describe("resolveExtensionHostProviderMatch", () => {
  it("matches providers by normalized id and aliases", () => {
    const providers = [
      makeProvider({
        id: "openrouter",
        label: "OpenRouter",
        aliases: ["Open Router"],
      }),
    ];

    expect(resolveExtensionHostProviderMatch(providers, "openrouter")?.id).toBe("openrouter");
    expect(resolveExtensionHostProviderMatch(providers, " Open Router ")?.id).toBe("openrouter");
    expect(resolveExtensionHostProviderMatch(providers, "missing")).toBeNull();
  });
});

describe("pickExtensionHostAuthMethod", () => {
  it("matches auth methods by id or label", () => {
    const provider = makeProvider({
      id: "ollama",
      label: "Ollama",
      auth: [
        { id: "local", label: "Local", kind: "custom", run: vi.fn() },
        { id: "cloud", label: "Cloud", kind: "custom", run: vi.fn() },
      ],
    });

    expect(pickExtensionHostAuthMethod(provider, "local")?.id).toBe("local");
    expect(pickExtensionHostAuthMethod(provider, "cloud")?.id).toBe("cloud");
    expect(pickExtensionHostAuthMethod(provider, "Cloud")?.id).toBe("cloud");
    expect(pickExtensionHostAuthMethod(provider, "missing")).toBeNull();
  });
});

describe("mergeExtensionHostConfigPatch", () => {
  it("deep-merges plain record config patches", () => {
    expect(
      mergeExtensionHostConfigPatch(
        {
          models: { providers: { ollama: { baseUrl: "http://127.0.0.1:11434" } } },
          auth: { profiles: { existing: { provider: "anthropic" } } },
        },
        {
          models: { providers: { ollama: { api: "ollama" } } },
          auth: { profiles: { fresh: { provider: "ollama" } } },
        },
      ),
    ).toEqual({
      models: { providers: { ollama: { baseUrl: "http://127.0.0.1:11434", api: "ollama" } } },
      auth: {
        profiles: {
          existing: { provider: "anthropic" },
          fresh: { provider: "ollama" },
        },
      },
    });
  });
});

describe("applyExtensionHostDefaultModel", () => {
  it("sets the primary model while preserving fallback config", () => {
    expect(
      applyExtensionHostDefaultModel(
        {
          agents: {
            defaults: {
              model: {
                primary: "anthropic/claude-sonnet-4-5",
                fallbacks: ["openai/gpt-5"],
              },
            },
          },
        },
        "ollama/qwen3:4b",
      ),
    ).toEqual({
      agents: {
        defaults: {
          models: {
            "ollama/qwen3:4b": {},
          },
          model: {
            primary: "ollama/qwen3:4b",
            fallbacks: ["openai/gpt-5"],
          },
        },
      },
    });
  });
});
