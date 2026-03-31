import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildKimiCodingProvider } from "../plugin-sdk/kimi-coding.js";
import { resolveImplicitProvidersForTest } from "./models-config.e2e-harness.js";

describe("Kimi implicit provider (#22409)", () => {
  it("should include Kimi when KIMI_API_KEY is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: { KIMI_API_KEY: "test-key" }, // pragma: allowlist secret
      onlyPluginIds: ["kimi"],
    });
    expect(providers?.kimi).toBeDefined();
    expect(providers?.kimi?.api).toBe("anthropic-messages");
    expect(providers?.kimi?.baseUrl).toBe("https://api.kimi.com/coding/");
  });

  it("should build Kimi provider with anthropic-messages API", () => {
    const provider = buildKimiCodingProvider();
    expect(provider.api).toBe("anthropic-messages");
    expect(provider.baseUrl).toBe("https://api.kimi.com/coding/");
    expect(provider.headers).toEqual({ "User-Agent": "claude-code/0.1.0" });
    expect(provider.models).toBeDefined();
    expect(provider.models.length).toBeGreaterThan(0);
    expect(provider.models[0].id).toBe("kimi-code");
    expect(provider.models.some((model) => model.id === "k2p5")).toBe(true);
  });

  it("should not include Kimi when no API key is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {},
      onlyPluginIds: ["kimi"],
    });
    expect(providers?.kimi).toBeUndefined();
  });

  it("uses explicit legacy kimi-coding baseUrl when provided", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: { KIMI_API_KEY: "test-key" },
      onlyPluginIds: ["kimi"],
      explicitProviders: {
        "kimi-coding": {
          baseUrl: "https://kimi.example.test/coding/",
          api: "anthropic-messages",
          models: buildKimiCodingProvider().models,
        },
      },
    });
    expect(providers?.kimi?.baseUrl).toBe("https://kimi.example.test/coding/");
  });

  it("merges explicit legacy kimi-coding headers on top of the built-in user agent", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: { KIMI_API_KEY: "test-key" },
      onlyPluginIds: ["kimi"],
      explicitProviders: {
        "kimi-coding": {
          baseUrl: "https://api.kimi.com/coding/",
          api: "anthropic-messages",
          headers: {
            "User-Agent": "custom-kimi-client/1.0",
            "X-Kimi-Tenant": "tenant-a",
          },
          models: buildKimiCodingProvider().models,
        },
      },
    });
    expect(providers?.kimi?.headers).toEqual({
      "User-Agent": "custom-kimi-client/1.0",
      "X-Kimi-Tenant": "tenant-a",
    });
  });
});
