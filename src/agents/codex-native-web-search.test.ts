import { describe, expect, it } from "vitest";
import {
  buildCodexNativeWebSearchTool,
  patchPayloadForCodexNativeWebSearch,
  resolveCodexNativeSearchActivation,
  resolveCodexNativeWebSearchConfig,
} from "./codex-native-web-search.js";

describe("resolveCodexNativeWebSearchConfig", () => {
  it("defaults to preserving OpenClaw search behavior", () => {
    expect(resolveCodexNativeWebSearchConfig()).toEqual({
      strategy: "openclaw",
      mode: "cached",
      allowedDomains: undefined,
      contextSize: undefined,
      userLocation: undefined,
    });
  });

  it("normalizes allowed domains and user location", () => {
    expect(
      resolveCodexNativeWebSearchConfig({
        tools: {
          web: {
            search: {
              openaiCodex: {
                strategy: "native",
                mode: "live",
                allowedDomains: [" example.com ", "", "example.com", "openai.com"],
                contextSize: "high",
                userLocation: {
                  country: " US ",
                  region: " ",
                  city: " New York ",
                  timezone: " America/New_York ",
                },
              },
            },
          },
        },
      }),
    ).toEqual({
      strategy: "native",
      mode: "live",
      allowedDomains: ["example.com", "openai.com"],
      contextSize: "high",
      userLocation: {
        country: "US",
        city: "New York",
        timezone: "America/New_York",
      },
    });
  });
});

describe("resolveCodexNativeSearchActivation", () => {
  it("keeps OpenClaw search for non-Codex models", () => {
    const resolved = resolveCodexNativeSearchActivation({
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
      modelProvider: "openai",
      modelId: "gpt-4.1",
      hasCodexAuth: true,
    });

    expect(resolved.state).toBe("openclaw_search");
    expect(resolved.nativeEnabled).toBe(false);
  });

  it("activates native Codex search only when auth is available", () => {
    const resolved = resolveCodexNativeSearchActivation({
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
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      hasCodexAuth: true,
    });

    expect(resolved.state).toBe("native_codex_search");
    expect(resolved.nativeEnabled).toBe(true);
  });

  it("disables search when native mode is disabled", () => {
    const resolved = resolveCodexNativeSearchActivation({
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
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      hasCodexAuth: true,
    });

    expect(resolved.state).toBe("search_disabled");
  });

  it("disables all search when the global master switch is off", () => {
    const resolved = resolveCodexNativeSearchActivation({
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
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      hasCodexAuth: true,
    });

    expect(resolved.state).toBe("search_disabled");
  });

  it("fails closed when embedded auth is explicitly missing", () => {
    const resolved = resolveCodexNativeSearchActivation({
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
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      hasCodexAuth: false,
    });

    expect(resolved.state).toBe("search_disabled");
    expect(resolved.nativeEnabled).toBe(false);
  });

  it("fails closed when auth visibility is unavailable for the direct Codex provider", () => {
    const resolved = resolveCodexNativeSearchActivation({
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
      modelProvider: "openai-codex",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
    });

    expect(resolved.state).toBe("search_disabled");
  });

  it("allows API-compatible Codex gateways without separate Codex OAuth", () => {
    const resolved = resolveCodexNativeSearchActivation({
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
      modelProvider: "custom-openai-gateway",
      modelApi: "openai-codex-responses",
      modelId: "codex-mini-latest",
      hasCodexAuth: false,
    });

    expect(resolved.state).toBe("native_codex_search");
    expect(resolved.nativeEnabled).toBe(true);
  });
});

describe("buildCodexNativeWebSearchTool", () => {
  it("builds a native tool payload from normalized config", () => {
    expect(
      buildCodexNativeWebSearchTool({
        strategy: "native",
        mode: "live",
        allowedDomains: ["example.com"],
        contextSize: "medium",
        userLocation: {
          country: "US",
          city: "New York",
        },
      }),
    ).toEqual({
      type: "web_search",
      external_web_access: true,
      filters: {
        allowed_domains: ["example.com"],
      },
      search_context_size: "medium",
      user_location: {
        type: "approximate",
        country: "US",
        city: "New York",
      },
    });
  });

  it("omits empty normalized allowedDomains and userLocation fields", () => {
    expect(
      buildCodexNativeWebSearchTool(
        resolveCodexNativeWebSearchConfig({
          tools: {
            web: {
              search: {
                openaiCodex: {
                  strategy: "native",
                  allowedDomains: [" ", ""],
                  userLocation: {
                    country: " ",
                    city: "",
                  },
                },
              },
            },
          },
        }),
      ),
    ).toEqual({
      type: "web_search",
      external_web_access: false,
    });
  });
});

describe("patchPayloadForCodexNativeWebSearch", () => {
  const config = {
    strategy: "native",
    mode: "cached",
    allowedDomains: ["example.com"],
    contextSize: "high",
    userLocation: {
      country: "US",
      timezone: "America/New_York",
    },
  } as const;

  it("preserves existing function tools and injects native web_search", () => {
    const patched = patchPayloadForCodexNativeWebSearch({
      payload: {
        tools: [
          { type: "function", function: { name: "web_search" } },
          { type: "function", function: { name: "web_fetch" } },
        ],
      },
      config,
    });

    expect(patched.kind).toBe("injected");
    if (patched.kind !== "injected") {
      throw new Error("expected injected payload");
    }
    expect(patched.payload).toEqual({
      tools: [
        { type: "function", function: { name: "web_search" } },
        { type: "function", function: { name: "web_fetch" } },
        {
          type: "web_search",
          external_web_access: false,
          filters: { allowed_domains: ["example.com"] },
          search_context_size: "high",
          user_location: {
            type: "approximate",
            country: "US",
            timezone: "America/New_York",
          },
        },
      ],
    });
  });

  it("does not append a duplicate native tool", () => {
    const patched = patchPayloadForCodexNativeWebSearch({
      payload: {
        tools: [
          { type: "function", function: { name: "web_search" } },
          { type: "web_search_2025_08_26", external_web_access: true },
        ],
      },
      config,
    });

    expect(patched.kind).toBe("existing_native_tool");
    if (patched.kind !== "existing_native_tool") {
      throw new Error("expected existing_native_tool result");
    }
    expect(patched.payload).toEqual({
      tools: [
        { type: "function", function: { name: "web_search" } },
        { type: "web_search_2025_08_26", external_web_access: true },
      ],
    });
  });

  it("rejects non-object payloads", () => {
    expect(
      patchPayloadForCodexNativeWebSearch({
        payload: null,
        config,
      }),
    ).toEqual({ kind: "payload_not_object" });
  });
});
