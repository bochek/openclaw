import { describe, expect, it } from "vitest";
import type { ModelProviderConfig } from "../config/types.js";
import type { ProviderDiscoveryOrder, ProviderPlugin } from "../plugins/types.js";
import {
  groupExtensionHostDiscoveryProvidersByOrder,
  normalizeExtensionHostDiscoveryResult,
  resolveExtensionHostDiscoveryProviders,
} from "./provider-discovery.js";

function makeProvider(params: {
  id: string;
  label?: string;
  order?: ProviderDiscoveryOrder;
  discovery?: boolean;
}): ProviderPlugin {
  return {
    id: params.id,
    label: params.label ?? params.id,
    auth: [],
    ...(params.discovery === false
      ? {}
      : {
          discovery: {
            ...(params.order ? { order: params.order } : {}),
            run: async () => null,
          },
        }),
  };
}

function makeModelProviderConfig(overrides?: Partial<ModelProviderConfig>): ModelProviderConfig {
  return {
    baseUrl: "http://127.0.0.1:8000/v1",
    models: [],
    ...overrides,
  };
}

describe("resolveExtensionHostDiscoveryProviders", () => {
  it("keeps only providers with discovery handlers", () => {
    expect(
      resolveExtensionHostDiscoveryProviders([
        makeProvider({ id: "simple" }),
        makeProvider({ id: "hidden", discovery: false }),
      ]).map((provider) => provider.id),
    ).toEqual(["simple"]);
  });
});

describe("groupExtensionHostDiscoveryProvidersByOrder", () => {
  it("groups providers by declared order and sorts labels within each group", () => {
    const grouped = groupExtensionHostDiscoveryProvidersByOrder([
      makeProvider({ id: "late-b", label: "Zulu" }),
      makeProvider({ id: "late-a", label: "Alpha" }),
      makeProvider({ id: "paired", label: "Paired", order: "paired" }),
      makeProvider({ id: "profile", label: "Profile", order: "profile" }),
      makeProvider({ id: "simple", label: "Simple", order: "simple" }),
    ]);

    expect(grouped.simple.map((provider) => provider.id)).toEqual(["simple"]);
    expect(grouped.profile.map((provider) => provider.id)).toEqual(["profile"]);
    expect(grouped.paired.map((provider) => provider.id)).toEqual(["paired"]);
    expect(grouped.late.map((provider) => provider.id)).toEqual(["late-a", "late-b"]);
  });
});

describe("normalizeExtensionHostDiscoveryResult", () => {
  it("maps a single provider result to the provider id", () => {
    const provider = makeProvider({ id: "Ollama" });
    const normalized = normalizeExtensionHostDiscoveryResult({
      provider,
      result: {
        provider: makeModelProviderConfig({
          baseUrl: "http://127.0.0.1:11434",
          api: "ollama",
        }),
      },
    });

    expect(normalized).toEqual({
      ollama: {
        baseUrl: "http://127.0.0.1:11434",
        api: "ollama",
        models: [],
      },
    });
  });

  it("normalizes keys for multi-provider discovery results", () => {
    const normalized = normalizeExtensionHostDiscoveryResult({
      provider: makeProvider({ id: "ignored" }),
      result: {
        providers: {
          " VLLM ": makeModelProviderConfig(),
          "": makeModelProviderConfig({ baseUrl: "http://ignored" }),
        },
      },
    });

    expect(normalized).toEqual({
      vllm: {
        baseUrl: "http://127.0.0.1:8000/v1",
        models: [],
      },
    });
  });
});
