import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveImplicitProvidersForTest } from "./models-config.e2e-harness.js";

const TEST_ENV = {
  VITEST: "true",
  NODE_ENV: "test",
} as NodeJS.ProcessEnv;

describe("Ollama auto-discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockOllamaUnreachable() {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new Error("connect ECONNREFUSED 127.0.0.1:11434"),
        ) as unknown as typeof fetch,
    );
  }

  it("auto-registers ollama provider when models are discovered locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string | URL) => {
        if (String(url).includes("/api/tags")) {
          return {
            ok: true,
            json: async () => ({
              models: [{ name: "deepseek-r1:latest" }, { name: "llama3.3:latest" }],
            }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }) as unknown as typeof fetch,
    );

    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {},
      onlyPluginIds: ["ollama"],
    });

    expect(providers?.ollama).toBeDefined();
    expect(providers?.ollama?.apiKey).toBe("ollama-local");
    expect(providers?.ollama?.api).toBe("ollama");
    expect(providers?.ollama?.baseUrl).toBe("http://127.0.0.1:11434");
    expect(providers?.ollama?.models).toHaveLength(2);
    expect(providers?.ollama?.models?.[0]?.id).toBe("deepseek-r1:latest");
    expect(providers?.ollama?.models?.[0]?.reasoning).toBe(true);
    expect(providers?.ollama?.models?.[1]?.reasoning).toBe(false);
  });

  it("skips ambient Ollama discovery in test mode when not explicitly configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockOllamaUnreachable();

    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: TEST_ENV,
      onlyPluginIds: ["ollama"],
    });

    expect(providers?.ollama).toBeUndefined();
    const ollamaWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Ollama"),
    );
    expect(ollamaWarnings).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it("warns when Ollama is unreachable and explicitly configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockOllamaUnreachable();

    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    await resolveImplicitProvidersForTest({
      agentDir,
      env: TEST_ENV,
      onlyPluginIds: ["ollama"],
      explicitProviders: {
        ollama: {
          baseUrl: "http://127.0.0.1:11434/v1",
          api: "openai-completions",
          models: [],
        },
      },
    });

    const ollamaWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("Ollama"),
    );
    expect(ollamaWarnings.length).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });
});
