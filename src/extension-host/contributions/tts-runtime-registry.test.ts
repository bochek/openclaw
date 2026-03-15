import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXTENSION_HOST_TTS_PROVIDER_IDS,
  isExtensionHostTtsProviderConfigured,
  resolveExtensionHostTtsApiKey,
  resolveExtensionHostTtsProviderOrder,
  supportsExtensionHostTtsTelephony,
} from "./tts-runtime-registry.js";

describe("extension host TTS runtime registry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the built-in provider order stable", () => {
    expect(EXTENSION_HOST_TTS_PROVIDER_IDS).toEqual(["openai", "elevenlabs", "edge"]);
    expect(resolveExtensionHostTtsProviderOrder("edge")).toEqual(["edge", "openai", "elevenlabs"]);
  });

  it("resolves API keys for remote providers", () => {
    const config = {
      openai: { apiKey: "openai-key" },
      elevenlabs: { apiKey: "xi-key" },
      edge: { enabled: false },
    } as const;

    expect(resolveExtensionHostTtsApiKey(config, "openai")).toBe("openai-key");
    expect(resolveExtensionHostTtsApiKey(config, "elevenlabs")).toBe("xi-key");
    expect(resolveExtensionHostTtsApiKey(config, "edge")).toBeUndefined();
  });

  it("checks provider configuration through the host-owned definitions", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("XI_API_KEY", "");

    const config = {
      openai: { apiKey: "openai-key" },
      elevenlabs: { apiKey: "" },
      edge: { enabled: true },
    } as const;

    expect(isExtensionHostTtsProviderConfigured(config, "openai")).toBe(true);
    expect(isExtensionHostTtsProviderConfigured(config, "elevenlabs")).toBe(false);
    expect(isExtensionHostTtsProviderConfigured(config, "edge")).toBe(true);
  });

  it("tracks telephony support per provider", () => {
    expect(supportsExtensionHostTtsTelephony("openai")).toBe(true);
    expect(supportsExtensionHostTtsTelephony("elevenlabs")).toBe(true);
    expect(supportsExtensionHostTtsTelephony("edge")).toBe(false);
  });
});
