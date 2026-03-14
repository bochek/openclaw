import { describe, expect, it } from "vitest";
import { applyModelProviderToolPolicy } from "./pi-tools.model-provider-policy.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

const baseTools = [
  { name: "read" },
  { name: "web_search" },
  { name: "web_fetch" },
  { name: "exec" },
] as unknown as AnyAgentTool[];

function toolNames(tools: AnyAgentTool[]): string[] {
  return tools.map((tool) => tool.name);
}

describe("applyModelProviderToolPolicy", () => {
  it("keeps web_search for non-xAI models", () => {
    const filtered = applyModelProviderToolPolicy(baseTools, {
      modelProvider: "openai",
      modelId: "gpt-4o-mini",
    });

    expect(toolNames(filtered)).toEqual(["read", "web_search", "web_fetch", "exec"]);
  });

  it("removes web_search for OpenRouter xAI model ids", () => {
    const filtered = applyModelProviderToolPolicy(baseTools, {
      modelProvider: "openrouter",
      modelId: "x-ai/grok-4.1-fast",
    });

    expect(toolNames(filtered)).toEqual(["read", "web_fetch", "exec"]);
  });

  it("removes web_search for direct xAI providers", () => {
    const filtered = applyModelProviderToolPolicy(baseTools, {
      modelProvider: "x-ai",
      modelId: "grok-4.1",
    });

    expect(toolNames(filtered)).toEqual(["read", "web_fetch", "exec"]);
  });

  it("keeps web_search for Codex by default", () => {
    const filtered = applyModelProviderToolPolicy(baseTools, {
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      codexAuthAvailable: true,
      cfg: {},
    });

    expect(toolNames(filtered)).toEqual(["read", "web_search", "web_fetch", "exec"]);
  });

  it("removes web_search for Codex native mode when auth is available", () => {
    const filtered = applyModelProviderToolPolicy(baseTools, {
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      codexAuthAvailable: true,
      cfg: {
        tools: {
          web: {
            search: {
              openaiCodex: {
                strategy: "native",
                mode: "cached",
              },
            },
          },
        },
      },
    });

    expect(toolNames(filtered)).toEqual(["read", "web_fetch", "exec"]);
  });

  it("treats Codex API eligibility the same even when provider id differs", () => {
    const filtered = applyModelProviderToolPolicy(baseTools, {
      modelProvider: "custom-openai-gateway",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      codexAuthAvailable: false,
      cfg: {
        tools: {
          web: {
            search: {
              openaiCodex: {
                strategy: "native",
              },
            },
          },
        },
      },
    });

    expect(toolNames(filtered)).toEqual(["read", "web_fetch", "exec"]);
  });

  it("removes web_search for Codex native mode when auth is missing", () => {
    const filtered = applyModelProviderToolPolicy(baseTools, {
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      codexAuthAvailable: false,
      cfg: {
        tools: {
          web: {
            search: {
              openaiCodex: {
                strategy: "native",
                mode: "live",
              },
            },
          },
        },
      },
    });

    expect(toolNames(filtered)).toEqual(["read", "web_fetch", "exec"]);
  });

  it("removes web_search when native strategy disables search", () => {
    const filtered = applyModelProviderToolPolicy(baseTools, {
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      codexAuthAvailable: true,
      cfg: {
        tools: {
          web: {
            search: {
              openaiCodex: {
                strategy: "native",
                mode: "disabled",
              },
            },
          },
        },
      },
    });

    expect(toolNames(filtered)).toEqual(["read", "web_fetch", "exec"]);
  });

  it("removes web_search when the global search switch is off", () => {
    const filtered = applyModelProviderToolPolicy(baseTools, {
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      codexAuthAvailable: true,
      cfg: {
        tools: {
          web: {
            search: {
              enabled: false,
              openaiCodex: {
                strategy: "native",
                mode: "live",
              },
            },
          },
        },
      },
    });

    expect(toolNames(filtered)).toEqual(["read", "web_fetch", "exec"]);
  });
});
