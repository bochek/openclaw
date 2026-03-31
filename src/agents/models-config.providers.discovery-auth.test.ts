import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NON_ENV_SECRETREF_MARKER } from "./model-auth-markers.js";
import { resolveImplicitProvidersForTest } from "./models-config.e2e-harness.js";
import { createProviderAuthResolver } from "./models-config.providers.secrets.js";

type AuthProfilesFile = {
  version: 1;
  profiles: Record<string, Record<string, unknown>>;
};

describe("provider discovery auth marker guardrails", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function installFetchMock(response?: unknown) {
    const fetchMock =
      response === undefined
        ? vi.fn()
        : vi.fn().mockResolvedValue({ ok: true, json: async () => response });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  async function createAgentDirWithAuthProfiles(profiles: AuthProfilesFile["profiles"]) {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    await writeFile(
      join(agentDir, "auth-profiles.json"),
      JSON.stringify({ version: 1, profiles } satisfies AuthProfilesFile, null, 2),
      "utf8",
    );
    return agentDir;
  }

  it("preserves marker-backed vLLM auth without probing local discovery in test mode", async () => {
    const fetchMock = installFetchMock({ data: [] });
    const agentDir = await createAgentDirWithAuthProfiles({
      "vllm:default": {
        type: "api_key",
        provider: "vllm",
        keyRef: { source: "file", provider: "vault", id: "/vllm/apiKey" },
      },
    });

    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {},
      onlyPluginIds: ["vllm"],
    });
    expect(providers?.vllm?.apiKey).toBe(NON_ENV_SECRETREF_MARKER);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call Hugging Face discovery with marker-backed credentials", async () => {
    const fetchMock = installFetchMock();
    const agentDir = await createAgentDirWithAuthProfiles({
      "huggingface:default": {
        type: "api_key",
        provider: "huggingface",
        keyRef: { source: "exec", provider: "vault", id: "providers/hf/token" },
      },
    });

    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {},
      onlyPluginIds: ["huggingface"],
    });
    expect(providers?.huggingface?.apiKey).toBe(NON_ENV_SECRETREF_MARKER);
    const huggingfaceCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("router.huggingface.co"),
    );
    expect(huggingfaceCalls).toHaveLength(0);
  });

  it("keeps all-caps plaintext API keys for vLLM summaries without probing local discovery in test mode", async () => {
    const fetchMock = installFetchMock({ data: [{ id: "vllm/test-model" }] });
    const agentDir = await createAgentDirWithAuthProfiles({
      "vllm:default": {
        type: "api_key",
        provider: "vllm",
        key: "ALLCAPS_SAMPLE",
      },
    });

    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {},
      onlyPluginIds: ["vllm"],
    });
    expect(providers?.vllm?.apiKey).toBe("ALLCAPS_SAMPLE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces xai provider auth from legacy grok web search config without persisting plaintext", async () => {
    const auth = createProviderAuthResolver(
      {},
      { version: 1, profiles: {} },
      {
        tools: {
          web: {
            search: {
              grok: {
                apiKey: "xai-legacy-config-key", // pragma: allowlist secret
              },
            },
          },
        },
      },
    );

    expect(auth("xai").apiKey).toBe(NON_ENV_SECRETREF_MARKER);
  });

  it("surfaces xai provider auth from SecretRef-backed legacy grok web search config", async () => {
    const auth = createProviderAuthResolver(
      {},
      { version: 1, profiles: {} },
      {
        tools: {
          web: {
            search: {
              grok: {
                apiKey: { source: "exec", provider: "vault", id: "providers/xai/token" },
              },
            },
          },
        },
      },
    );

    expect(auth("xai").apiKey).toBe(NON_ENV_SECRETREF_MARKER);
  });

  it("does not surface xai provider auth when the xai plugin is disabled", async () => {
    const auth = createProviderAuthResolver(
      {},
      { version: 1, profiles: {} },
      {
        plugins: {
          entries: {
            xai: {
              enabled: false,
              config: {
                webSearch: {
                  apiKey: "xai-plugin-config-key", // pragma: allowlist secret
                },
              },
            },
          },
        },
      },
    );

    expect(auth("xai").apiKey).toBeUndefined();
  });
});
