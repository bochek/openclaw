import { describe, expect, it } from "vitest";
import { buildMicrosoftFoundryRealtimeTranscriptionProvider } from "./realtime-transcription-provider.js";

describe("buildMicrosoftFoundryRealtimeTranscriptionProvider", () => {
  it("normalizes foundry config from the voice provider block", () => {
    const provider = buildMicrosoftFoundryRealtimeTranscriptionProvider();
    const resolved = provider.resolveConfig?.({
      cfg: {} as never,
      rawConfig: {
        providers: {
          "microsoft-foundry": {
            apiKey: "azure-test-key",
            baseUrl: "https://example.services.ai.azure.com/openai/v1",
            deployment: "gpt-realtime",
            apiVersion: "2025-04-01-preview",
          },
        },
      },
    });

    expect(resolved).toEqual({
      apiKey: "azure-test-key",
      baseUrl: "https://example.services.ai.azure.com/openai/v1",
      deployment: "gpt-realtime",
      apiVersion: "2025-04-01-preview",
    });
  });

  it("accepts model-provider style config with api-key headers", () => {
    const provider = buildMicrosoftFoundryRealtimeTranscriptionProvider();
    const resolved = provider.resolveConfig?.({
      cfg: {} as never,
      rawConfig: {
        providers: {
          "microsoft-foundry": {
            baseUrl: "https://example.services.ai.azure.com/openai/v1",
            headers: {
              "api-key": "azure-test-key",
            },
            model: "gpt-realtime",
          },
        },
      },
    });

    expect(resolved).toEqual({
      apiKey: "azure-test-key",
      baseUrl: "https://example.services.ai.azure.com/openai/v1",
      deployment: "gpt-realtime",
      model: "gpt-realtime",
    });
  });

  it("registers foundry aliases for voice provider selection", () => {
    const provider = buildMicrosoftFoundryRealtimeTranscriptionProvider();
    expect(provider.aliases).toContain("azure-foundry");
  });
});
