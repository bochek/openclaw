import { describe, expect, it } from "vitest";
import {
  buildExtensionHostMediaUnderstandingRegistry,
  getExtensionHostMediaUnderstandingProvider,
  normalizeExtensionHostMediaProviderId,
} from "./media-runtime-registry.js";

describe("extension host media runtime registry", () => {
  it("registers built-in providers", () => {
    const registry = buildExtensionHostMediaUnderstandingRegistry();
    const provider = getExtensionHostMediaUnderstandingProvider("mistral", registry);

    expect(provider?.id).toBe("mistral");
    expect(provider?.capabilities).toEqual(["audio"]);
  });

  it("keeps media-specific provider normalization", () => {
    expect(normalizeExtensionHostMediaProviderId("gemini")).toBe("google");
  });

  it("merges overrides onto built-in providers", () => {
    const registry = buildExtensionHostMediaUnderstandingRegistry({
      openai: {
        id: "openai",
        capabilities: ["image"],
      },
    });

    const provider = getExtensionHostMediaUnderstandingProvider("openai", registry);
    expect(provider?.id).toBe("openai");
    expect(provider?.capabilities).toEqual(["image"]);
    expect(provider?.describeImage).toBeTypeOf("function");
  });

  it("adds brand new providers", () => {
    const registry = buildExtensionHostMediaUnderstandingRegistry({
      custom: {
        id: "custom",
        capabilities: ["audio"],
      },
    });

    const provider = getExtensionHostMediaUnderstandingProvider("custom", registry);
    expect(provider?.id).toBe("custom");
    expect(provider?.capabilities).toEqual(["audio"]);
  });
});
