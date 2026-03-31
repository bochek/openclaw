import { describe, expect, it, vi } from "vitest";
import { registerSingleProviderPlugin } from "../../test/helpers/extensions/plugin-registration.js";

async function importAmazonBedrockPlugin() {
  return (await import("./index.js")).default;
}

describe("amazon-bedrock provider plugin", () => {
  it("marks Claude 4.6 Bedrock models as adaptive by default", async () => {
    const provider = registerSingleProviderPlugin(await importAmazonBedrockPlugin());

    expect(
      provider.resolveDefaultThinkingLevel?.({
        provider: "amazon-bedrock",
        modelId: "us.anthropic.claude-opus-4-6-v1",
      } as never),
    ).toBe("adaptive");
    expect(
      provider.resolveDefaultThinkingLevel?.({
        provider: "amazon-bedrock",
        modelId: "amazon.nova-micro-v1:0",
      } as never),
    ).toBeUndefined();
  });

  it("disables prompt caching for non-Anthropic Bedrock models", async () => {
    const provider = registerSingleProviderPlugin(await importAmazonBedrockPlugin());
    const wrapped = provider.wrapStreamFn?.({
      provider: "amazon-bedrock",
      modelId: "amazon.nova-micro-v1:0",
      streamFn: (_model: unknown, _context: unknown, options: Record<string, unknown>) => options,
    } as never);

    expect(
      wrapped?.(
        {
          api: "openai-completions",
          provider: "amazon-bedrock",
          id: "amazon.nova-micro-v1:0",
        } as never,
        { messages: [] } as never,
        {},
      ),
    ).toMatchObject({
      cacheRetention: "none",
    });
  });

  it("registers implicit Bedrock discovery through the plugin catalog", async () => {
    vi.resetModules();
    const bedrockApi = await import("./api.js");
    vi.spyOn(bedrockApi, "resolveImplicitBedrockProvider").mockResolvedValue({
      baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
      api: "bedrock-converse-stream",
      auth: "aws-sdk",
      models: [
        {
          id: "amazon.nova-micro-v1:0",
          name: "Nova Micro",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 32_000,
          maxTokens: 4096,
        },
      ],
    });
    vi.spyOn(bedrockApi, "mergeImplicitBedrockProvider").mockImplementation(
      ({ existing, implicit }) => ({
        ...implicit,
        ...existing,
        models:
          Array.isArray(existing?.models) && existing.models.length > 0
            ? existing.models
            : implicit.models,
      }),
    );

    const provider = registerSingleProviderPlugin(await importAmazonBedrockPlugin());
    const result = await provider.catalog?.run({
      config: {
        models: {
          bedrockDiscovery: {
            enabled: true,
          },
          providers: {
            "amazon-bedrock": {
              headers: { "x-test-header": "1" },
              models: [],
            },
          },
        },
      },
      env: {
        AWS_PROFILE: "default",
      } as NodeJS.ProcessEnv,
      resolveProviderApiKey: () => ({ apiKey: undefined, discoveryApiKey: undefined }),
      resolveProviderAuth: () => ({
        apiKey: undefined,
        discoveryApiKey: undefined,
        mode: "none",
        source: "none",
      }),
    });

    expect(result).toMatchObject({
      provider: {
        api: "bedrock-converse-stream",
        auth: "aws-sdk",
        baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
        headers: { "x-test-header": "1" },
      },
    });
    expect(
      result && "provider" in result
        ? result.provider.models?.map((model: { id: string }) => model.id)
        : [],
    ).toEqual(["amazon.nova-micro-v1:0"]);
  });
});
