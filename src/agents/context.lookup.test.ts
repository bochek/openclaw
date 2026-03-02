import { beforeEach, describe, expect, it, vi } from "vitest";

describe("lookupContextTokens", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns configured model context window on first lookup", async () => {
    vi.doMock("../config/config.js", () => ({
      loadConfig: () => ({
        models: {
          providers: {
            openrouter: {
              models: [{ id: "openrouter/claude-sonnet", contextWindow: 321_000 }],
            },
          },
        },
      }),
    }));
    vi.doMock("./models-config.js", () => ({
      ensureOpenClawModelsJson: vi.fn(async () => {}),
    }));
    vi.doMock("./agent-paths.js", () => ({
      resolveOpenClawAgentDir: () => "/tmp/openclaw-agent",
    }));
    vi.doMock("./pi-model-discovery.js", () => ({
      discoverAuthStorage: vi.fn(() => ({})),
      discoverModels: vi.fn(() => ({
        getAll: () => [],
      })),
    }));

    const { lookupContextTokens } = await import("./context.js");
    expect(lookupContextTokens("openrouter/claude-sonnet")).toBe(321_000);
  });
});
