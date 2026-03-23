import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSglangProvider, buildVllmProvider } from "./models-config.providers.discovery.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("self-hosted OpenAI-compatible providers", () => {
  function enableDiscoveryEnv() {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "development");
  }

  it("marks discovered vLLM models as tools-disabled by default", async () => {
    enableDiscoveryEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: "Qwen/Qwen3-8B" }],
        }),
      })),
    );

    const provider = await buildVllmProvider();

    expect(provider.models).toEqual([
      expect.objectContaining({
        id: "Qwen/Qwen3-8B",
        compat: { supportsTools: false },
      }),
    ]);
  });

  it("marks discovered SGLang models as tools-disabled by default", async () => {
    enableDiscoveryEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: "Qwen/Qwen3-14B" }],
        }),
      })),
    );

    const provider = await buildSglangProvider();

    expect(provider.models).toEqual([
      expect.objectContaining({
        id: "Qwen/Qwen3-14B",
        compat: { supportsTools: false },
      }),
    ]);
  });
});
