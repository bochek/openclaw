import { describe, expect, it } from "vitest";
import { collectSelfHostedOpenAiToolWarnings } from "./self-hosted-openai.js";

describe("doctor self-hosted OpenAI-compatible tool warnings", () => {
  it("warns when vLLM tools are enabled or unspecified", () => {
    const warnings = collectSelfHostedOpenAiToolWarnings({
      models: {
        providers: {
          vllm: {
            baseUrl: "http://127.0.0.1:8000/v1",
            models: [
              {
                id: "Qwen/Qwen3-8B",
                name: "Qwen/Qwen3-8B",
                reasoning: true,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 131072,
                maxTokens: 8192,
              },
            ],
          },
        },
      },
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Recommended: disable tools if you are unsure or having issues using openclaw config set models.providers.vllm.models[0].compat.supportsTools false --strict-json.');
  });

  it("stays quiet when self-hosted tools are explicitly disabled", () => {
    const warnings = collectSelfHostedOpenAiToolWarnings({
      models: {
        providers: {
          sglang: {
            baseUrl: "http://127.0.0.1:30000/v1",
            models: [
              {
                id: "Qwen/Qwen3-14B",
                name: "Qwen/Qwen3-14B",
                reasoning: true,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 131072,
                maxTokens: 8192,
                compat: {
                  supportsTools: false,
                },
              },
            ],
          },
        },
      },
    });

    expect(warnings).toEqual([]);
  });
});
