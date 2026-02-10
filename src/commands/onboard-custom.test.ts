import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultRuntime } from "../runtime.js";
import { promptCustomApiConfig } from "./onboard-custom.js";

// Mock dependencies
vi.mock("./model-picker.js", () => ({
  applyPrimaryModel: vi.fn((cfg) => cfg),
}));

describe("promptCustomApiConfig", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("handles openai discovery and saves alias", async () => {
    const prompter = {
      text: vi
        .fn()
        .mockResolvedValueOnce("http://localhost:11434/v1") // Base URL
        .mockResolvedValueOnce("") // API Key
        .mockResolvedValueOnce("custom") // Endpoint ID
        .mockResolvedValueOnce("local"), // Alias
      progress: vi.fn(() => ({
        update: vi.fn(),
        stop: vi.fn(),
      })),
      select: vi
        .fn()
        .mockResolvedValueOnce("openai") // Compatibility
        .mockResolvedValueOnce("llama3"), // Model selection
      confirm: vi.fn(),
      note: vi.fn(),
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: "llama3" }, { id: "mistral" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        }),
    );

    const result = await promptCustomApiConfig({
      prompter: prompter as unknown as Parameters<typeof promptCustomApiConfig>[0]["prompter"],
      runtime: { ...defaultRuntime, log: vi.fn() },
      config: {},
    });

    expect(prompter.text).toHaveBeenCalledTimes(4);
    expect(prompter.select).toHaveBeenCalledTimes(2);
    expect(result.config.models?.providers?.custom?.api).toBe("openai-completions");
    expect(result.config.agents?.defaults?.models?.["custom/llama3"]?.alias).toBe("local");
  });

  it("falls back to manual entry when discovery fails", async () => {
    const prompter = {
      text: vi
        .fn()
        .mockResolvedValueOnce("http://localhost:11434/v1") // Base URL
        .mockResolvedValueOnce("") // API Key
        .mockResolvedValueOnce("custom") // Endpoint ID
        .mockResolvedValueOnce("manual-model-id") // Manual model
        .mockResolvedValueOnce(""), // Alias
      progress: vi.fn(() => ({
        update: vi.fn(),
        stop: vi.fn(),
      })),
      select: vi.fn().mockResolvedValueOnce("openai"), // Compatibility only
      confirm: vi.fn().mockResolvedValue(true),
      note: vi.fn(),
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error")),
    );

    await promptCustomApiConfig({
      prompter: prompter as unknown as Parameters<typeof promptCustomApiConfig>[0]["prompter"],
      runtime: { ...defaultRuntime, log: vi.fn() },
      config: {},
    });

    expect(prompter.text).toHaveBeenCalledTimes(5);
    expect(prompter.confirm).toHaveBeenCalled();
  });

  it("renames provider id when baseUrl differs", async () => {
    const prompter = {
      text: vi
        .fn()
        .mockResolvedValueOnce("http://localhost:11434/v1") // Base URL
        .mockResolvedValueOnce("") // API Key
        .mockResolvedValueOnce("custom") // Endpoint ID
        .mockResolvedValueOnce("llama3") // Manual model
        .mockResolvedValueOnce(""), // Alias
      progress: vi.fn(() => ({
        update: vi.fn(),
        stop: vi.fn(),
      })),
      select: vi.fn().mockResolvedValueOnce("openai"),
      confirm: vi.fn(),
      note: vi.fn(),
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Discovery failed"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        }),
    );

    const result = await promptCustomApiConfig({
      prompter: prompter as unknown as Parameters<typeof promptCustomApiConfig>[0]["prompter"],
      runtime: { ...defaultRuntime, log: vi.fn() },
      config: {
        models: {
          providers: {
            custom: {
              baseUrl: "http://old.example.com/v1",
              api: "openai-completions",
              models: [
                {
                  id: "old-model",
                  name: "Old",
                  contextWindow: 1,
                  maxTokens: 1,
                  input: ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  reasoning: false,
                },
              ],
            },
          },
        },
      },
    });

    expect(result.providerId).toBe("custom-2");
    expect(result.config.models?.providers?.custom).toBeDefined();
    expect(result.config.models?.providers?.["custom-2"]).toBeDefined();
  });

  it("aborts discovery after timeout", async () => {
    vi.useFakeTimers();
    const prompter = {
      text: vi
        .fn()
        .mockResolvedValueOnce("http://localhost:11434/v1") // Base URL
        .mockResolvedValueOnce("") // API Key
        .mockResolvedValueOnce("custom") // Endpoint ID
        .mockResolvedValueOnce("manual-model-id") // Manual model
        .mockResolvedValueOnce(""), // Alias
      progress: vi.fn(() => ({
        update: vi.fn(),
        stop: vi.fn(),
      })),
      select: vi.fn().mockResolvedValueOnce("openai"),
      confirm: vi.fn(),
      note: vi.fn(),
    };

    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init?: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("AbortError")));
        });
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const promise = promptCustomApiConfig({
      prompter: prompter as unknown as Parameters<typeof promptCustomApiConfig>[0]["prompter"],
      runtime: { ...defaultRuntime, log: vi.fn() },
      config: {},
    });

    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(prompter.text).toHaveBeenCalledTimes(5);
  });
});
