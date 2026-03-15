import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { buildExtensionHostMediaUnderstandingRegistry } from "./media-runtime-registry.js";
import { resolveExtensionHostMediaRuntimeDefaultModel } from "./runtime-backend-catalog.js";

const resolveApiKeyForProvider = vi.hoisted(() => vi.fn());

vi.mock("../agents/model-auth.js", () => ({
  resolveApiKeyForProvider,
}));

import { resolveAutoImageModel } from "./media-runtime-auto.js";

function createImageCfg(): OpenClawConfig {
  return {
    models: {
      providers: {
        openai: {
          apiKey: "test-key",
          models: [],
        },
      },
    },
  } as unknown as OpenClawConfig;
}

describe("media runtime auto image model", () => {
  beforeEach(() => {
    resolveApiKeyForProvider.mockReset();
    resolveApiKeyForProvider.mockImplementation(
      async ({ provider, cfg }: { provider: string; cfg: OpenClawConfig }) => {
        if (cfg.models?.providers?.[provider]) {
          return {
            apiKey: "test-key",
            source: "config",
            mode: "api-key",
          };
        }
        throw new Error("missing key");
      },
    );
  });

  it("keeps a valid active image model", async () => {
    const result = await resolveAutoImageModel({
      cfg: createImageCfg(),
      providerRegistry: buildExtensionHostMediaUnderstandingRegistry(),
      activeModel: {
        provider: "openai",
        model: "gpt-4.1-mini",
      },
    });

    expect(result).toEqual({
      provider: "openai",
      model: "gpt-4.1-mini",
    });
  });

  it("falls back to the default keyed image model when the active model cannot be used", async () => {
    const result = await resolveAutoImageModel({
      cfg: createImageCfg(),
      providerRegistry: buildExtensionHostMediaUnderstandingRegistry(),
      activeModel: {
        provider: "missing-provider",
        model: "ignored",
      },
    });

    expect(result).toEqual({
      provider: "openai",
      model: resolveExtensionHostMediaRuntimeDefaultModel({
        capability: "image",
        backendId: "openai",
      }),
    });
  });

  it("keeps catalog image provider ordering when multiple keyed providers are available", async () => {
    const result = await resolveAutoImageModel({
      cfg: {
        models: {
          providers: {
            anthropic: {
              apiKey: "anthropic-test-key",
              models: [],
            },
            google: {
              apiKey: "google-test-key",
              models: [],
            },
          },
        },
      } as unknown as OpenClawConfig,
      providerRegistry: buildExtensionHostMediaUnderstandingRegistry(),
      activeModel: {
        provider: "missing-provider",
        model: "ignored",
      },
    });

    expect(result).toEqual({
      provider: "anthropic",
      model: resolveExtensionHostMediaRuntimeDefaultModel({
        capability: "image",
        backendId: "anthropic",
      }),
    });
  });
});
