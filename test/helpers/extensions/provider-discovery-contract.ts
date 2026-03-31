import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfileStore } from "../../../src/agents/auth-profiles/types.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import type { ModelDefinitionConfig } from "../../../src/config/types.models.js";
import { runProviderCatalog } from "../../../src/plugins/provider-discovery.js";
import { registerProviders, requireProvider } from "../../../src/plugins/contracts/testkit.js";

const resolveCopilotApiTokenMock = vi.hoisted(() => vi.fn());
const buildOllamaProviderMock = vi.hoisted(() => vi.fn());
const buildVllmProviderMock = vi.hoisted(() => vi.fn());
const buildSglangProviderMock = vi.hoisted(() => vi.fn());
const ensureAuthProfileStoreMock = vi.hoisted(() => vi.fn());
const listProfilesForProviderMock = vi.hoisted(() => vi.fn());
const bundledProviderModules = vi.hoisted(() => ({
  cloudflareAiGatewayIndexModuleUrl: new URL(
    "../../../extensions/cloudflare-ai-gateway/index.ts",
    import.meta.url,
  ).href,
  cloudflareAiGatewayIndexModuleId: new URL(
    "../../../extensions/cloudflare-ai-gateway/index.js",
    import.meta.url,
  ).pathname,
  githubCopilotIndexModuleUrl: new URL(
    "../../../extensions/github-copilot/index.ts",
    import.meta.url,
  ).href,
  githubCopilotTokenModuleId: new URL(
    "../../../extensions/github-copilot/token.js",
    import.meta.url,
  ).pathname,
  minimaxIndexModuleUrl: new URL("../../../extensions/minimax/index.ts", import.meta.url).href,
  modelStudioIndexModuleUrl: new URL("../../../extensions/modelstudio/index.ts", import.meta.url)
    .href,
  ollamaApiModuleId: new URL("../../../extensions/ollama/api.js", import.meta.url).pathname,
  ollamaIndexModuleUrl: new URL("../../../extensions/ollama/index.ts", import.meta.url).href,
  sglangApiModuleId: new URL("../../../extensions/sglang/api.js", import.meta.url).pathname,
  sglangIndexModuleUrl: new URL("../../../extensions/sglang/index.ts", import.meta.url).href,
  vllmApiModuleId: new URL("../../../extensions/vllm/api.js", import.meta.url).pathname,
  vllmIndexModuleUrl: new URL("../../../extensions/vllm/index.ts", import.meta.url).href,
}));

type ProviderHandle = Awaited<ReturnType<typeof requireProvider>>;

type DiscoveryState = {
  runProviderCatalog: typeof runProviderCatalog;
  githubCopilotProvider?: ProviderHandle;
  ollamaProvider?: ProviderHandle;
  vllmProvider?: ProviderHandle;
  sglangProvider?: ProviderHandle;
  minimaxProvider?: ProviderHandle;
  minimaxPortalProvider?: ProviderHandle;
  modelStudioProvider?: ProviderHandle;
  cloudflareAiGatewayProvider?: ProviderHandle;
  ollamaTesting?: {
    resetDepsForTest: () => void;
    setDepsForTest: (overrides: Partial<{ buildOllamaProvider: typeof buildOllamaProviderMock }>) => void;
  };
  vllmTesting?: {
    resetDepsForTest: () => void;
    setDepsForTest: (overrides: Partial<{ buildVllmProvider: typeof buildVllmProviderMock }>) => void;
  };
  sglangTesting?: {
    resetDepsForTest: () => void;
    setDepsForTest: (overrides: Partial<{ buildSglangProvider: typeof buildSglangProviderMock }>) => void;
  };
};

function createModelConfig(id: string, name = id): ModelDefinitionConfig {
  return {
    id,
    name,
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128_000,
    maxTokens: 8_192,
  };
}

function setRuntimeAuthStore(store?: AuthProfileStore) {
  const resolvedStore = store ?? {
    version: 1,
    profiles: {},
  };
  ensureAuthProfileStoreMock.mockReturnValue(resolvedStore);
  listProfilesForProviderMock.mockImplementation(
    (authStore: AuthProfileStore, providerId: string) =>
      Object.entries(authStore.profiles)
        .filter(([, credential]) => credential.provider === providerId)
        .map(([profileId]) => profileId),
  );
}

function setGithubCopilotProfileSnapshot() {
  setRuntimeAuthStore({
    version: 1,
    profiles: {
      "github-copilot:github": {
        type: "token",
        provider: "github-copilot",
        token: "profile-token",
      },
    },
  });
}

function runCatalog(
  state: DiscoveryState,
  params: {
    provider: ProviderHandle;
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    resolveProviderApiKey?: () => { apiKey: string | undefined };
    resolveProviderAuth?: (
      providerId?: string,
      options?: { oauthMarker?: string },
    ) => {
      apiKey: string | undefined;
      discoveryApiKey?: string;
      mode: "api_key" | "oauth" | "token" | "none";
      source: "env" | "profile" | "none";
      profileId?: string;
    };
  },
) {
  return state.runProviderCatalog({
    provider: params.provider,
    config: params.config ?? {},
    env: params.env ?? ({} as NodeJS.ProcessEnv),
    resolveProviderApiKey: params.resolveProviderApiKey ?? (() => ({ apiKey: undefined })),
    resolveProviderAuth:
      params.resolveProviderAuth ??
      ((_, options) => ({
        apiKey: options?.oauthMarker,
        discoveryApiKey: undefined,
        mode: options?.oauthMarker ? "oauth" : "none",
        source: options?.oauthMarker ? "profile" : "none",
      })),
  });
}

async function importBundledProviderPlugin<T>(moduleUrl: string): Promise<T> {
  return (await import(`${moduleUrl}?t=${Date.now()}`)) as T;
}

function installDiscoveryHooks(state: DiscoveryState) {
  beforeEach(async () => {
    state.runProviderCatalog = runProviderCatalog;
    const [
      { default: githubCopilotPlugin },
      { __testing: ollamaTesting, default: ollamaPlugin },
      { __testing: vllmTesting, default: vllmPlugin },
      { __testing: sglangTesting, default: sglangPlugin },
      { default: minimaxPlugin },
      { default: modelStudioPlugin },
      { default: cloudflareAiGatewayPlugin },
    ] = await Promise.all([
      importBundledProviderPlugin<{
        default: Parameters<typeof registerProviders>[0];
      }>(bundledProviderModules.githubCopilotIndexModuleUrl),
      importBundledProviderPlugin<{
        __testing: {
          resetDepsForTest: () => void;
          setDepsForTest: (
            overrides: Partial<{ buildOllamaProvider: typeof buildOllamaProviderMock }>,
          ) => void;
        };
        default: Parameters<typeof registerProviders>[0];
      }>(bundledProviderModules.ollamaIndexModuleUrl),
      importBundledProviderPlugin<{
        __testing: {
          resetDepsForTest: () => void;
          setDepsForTest: (
            overrides: Partial<{ buildVllmProvider: typeof buildVllmProviderMock }>,
          ) => void;
        };
        default: Parameters<typeof registerProviders>[0];
      }>(bundledProviderModules.vllmIndexModuleUrl),
      importBundledProviderPlugin<{
        __testing: {
          resetDepsForTest: () => void;
          setDepsForTest: (
            overrides: Partial<{ buildSglangProvider: typeof buildSglangProviderMock }>,
          ) => void;
        };
        default: Parameters<typeof registerProviders>[0];
      }>(bundledProviderModules.sglangIndexModuleUrl),
      importBundledProviderPlugin<{
        default: Parameters<typeof registerProviders>[0];
      }>(bundledProviderModules.minimaxIndexModuleUrl),
      importBundledProviderPlugin<{
        default: Parameters<typeof registerProviders>[0];
      }>(bundledProviderModules.modelStudioIndexModuleUrl),
      importBundledProviderPlugin<{
        default: Parameters<typeof registerProviders>[0];
      }>(bundledProviderModules.cloudflareAiGatewayIndexModuleUrl),
    ]);
    state.ollamaTesting = ollamaTesting;
    state.vllmTesting = vllmTesting;
    state.sglangTesting = sglangTesting;
    state.ollamaTesting.resetDepsForTest();
    state.ollamaTesting.setDepsForTest({
      buildOllamaProvider: (...args: unknown[]) => buildOllamaProviderMock(...args),
    });
    state.vllmTesting.resetDepsForTest();
    state.vllmTesting.setDepsForTest({
      buildVllmProvider: (...args: unknown[]) => buildVllmProviderMock(...args),
    });
    state.sglangTesting.resetDepsForTest();
    state.sglangTesting.setDepsForTest({
      buildSglangProvider: (...args: unknown[]) => buildSglangProviderMock(...args),
    });
    state.githubCopilotProvider = requireProvider(
      registerProviders(githubCopilotPlugin),
      "github-copilot",
    );
    state.ollamaProvider = requireProvider(registerProviders(ollamaPlugin), "ollama");
    state.vllmProvider = requireProvider(registerProviders(vllmPlugin), "vllm");
    state.sglangProvider = requireProvider(registerProviders(sglangPlugin), "sglang");
    state.minimaxProvider = requireProvider(registerProviders(minimaxPlugin), "minimax");
    state.minimaxPortalProvider = requireProvider(
      registerProviders(minimaxPlugin),
      "minimax-portal",
    );
    state.modelStudioProvider = requireProvider(
      registerProviders(modelStudioPlugin),
      "modelstudio",
    );
    state.cloudflareAiGatewayProvider = requireProvider(
      registerProviders(cloudflareAiGatewayPlugin),
      "cloudflare-ai-gateway",
    );
    setRuntimeAuthStore();
  });

  afterEach(() => {
    state.ollamaTesting?.resetDepsForTest();
    state.vllmTesting?.resetDepsForTest();
    state.sglangTesting?.resetDepsForTest();
    vi.restoreAllMocks();
    resolveCopilotApiTokenMock.mockReset();
    buildOllamaProviderMock.mockReset();
    buildVllmProviderMock.mockReset();
    buildSglangProviderMock.mockReset();
    ensureAuthProfileStoreMock.mockReset();
    listProfilesForProviderMock.mockReset();
  });
}

export function describeGithubCopilotProviderDiscoveryContract() {
  const state = {} as DiscoveryState;

  describe("github-copilot provider discovery contract", () => {
    beforeAll(async () => {
      vi.resetModules();
      ({ runProviderCatalog: state.runProviderCatalog } =
        await import("../../../src/plugins/provider-discovery.js"));
      const {
        __testing: githubCopilotTesting,
        default: githubCopilotPlugin,
      } = await importBundledProviderPlugin<{
        __testing: {
          resetDepsForTest: () => void;
          setDepsForTest: (
            overrides: Partial<{
              ensureAuthProfileStore: typeof ensureAuthProfileStoreMock;
              listProfilesForProvider: typeof listProfilesForProviderMock;
              resolveCopilotApiToken: typeof resolveCopilotApiTokenMock;
            }>,
          ) => void;
        };
        default: Parameters<typeof registerProviders>[0];
      }>(bundledProviderModules.githubCopilotIndexModuleUrl);
      githubCopilotTesting.resetDepsForTest();
      githubCopilotTesting.setDepsForTest({
        ensureAuthProfileStore: ensureAuthProfileStoreMock,
        listProfilesForProvider: listProfilesForProviderMock,
        resolveCopilotApiToken: resolveCopilotApiTokenMock,
      });
      state.githubCopilotProvider = requireProvider(
        registerProviders(githubCopilotPlugin),
        "github-copilot",
      );
    });

    beforeEach(() => {
      setRuntimeAuthStore();
    });

    afterAll(() => {
      vi.restoreAllMocks();
      resolveCopilotApiTokenMock.mockReset();
      ensureAuthProfileStoreMock.mockReset();
      listProfilesForProviderMock.mockReset();
    });

    it("keeps catalog disabled without env tokens or profiles", async () => {
      await expect(
        runCatalog(state, { provider: state.githubCopilotProvider! }),
      ).resolves.toBeNull();
    });

    it("keeps profile-only catalog fallback provider-owned", async () => {
      setGithubCopilotProfileSnapshot();

      await expect(
        runCatalog(state, {
          provider: state.githubCopilotProvider!,
        }),
      ).resolves.toEqual({
        provider: {
          baseUrl: "https://api.individual.githubcopilot.com",
          models: [],
        },
      });
    });

    it("keeps env-token base URL resolution provider-owned", async () => {
      resolveCopilotApiTokenMock.mockResolvedValueOnce({
        token: "copilot-api-token",
        baseUrl: "https://copilot-proxy.example.com",
        expiresAt: Date.now() + 60_000,
      });

      await expect(
        runCatalog(state, {
          provider: state.githubCopilotProvider!,
          env: {
            GITHUB_TOKEN: "github-env-token",
          } as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({ apiKey: undefined }),
        }),
      ).resolves.toEqual({
        provider: {
          baseUrl: "https://copilot-proxy.example.com",
          models: [],
        },
      });
      expect(resolveCopilotApiTokenMock).toHaveBeenCalledWith({
        githubToken: "github-env-token",
        env: expect.objectContaining({
          GITHUB_TOKEN: "github-env-token",
        }),
      });
    });
  });
}

export function describeOllamaProviderDiscoveryContract() {
  const state = {} as DiscoveryState;

  describe("ollama provider discovery contract", () => {
    installDiscoveryHooks(state);

    it("keeps explicit catalog normalization provider-owned", async () => {
      await expect(
        state.runProviderCatalog({
          provider: state.ollamaProvider!,
          config: {
            models: {
              providers: {
                ollama: {
                  baseUrl: "http://ollama-host:11434/v1/",
                  models: [createModelConfig("llama3.2")],
                },
              },
            },
          },
          env: {} as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({ apiKey: undefined }),
          resolveProviderAuth: () => ({
            apiKey: undefined,
            discoveryApiKey: undefined,
            mode: "none",
            source: "none",
          }),
        }),
      ).resolves.toMatchObject({
        provider: {
          baseUrl: "http://ollama-host:11434",
          api: "ollama",
          apiKey: "ollama-local",
          models: [createModelConfig("llama3.2")],
        },
      });
      expect(buildOllamaProviderMock).not.toHaveBeenCalled();
    });

    it("keeps empty autodiscovery disabled without keys or explicit config", async () => {
      buildOllamaProviderMock.mockResolvedValueOnce({
        baseUrl: "http://127.0.0.1:11434",
        api: "ollama",
        models: [],
      });

      await expect(
        runCatalog(state, {
          provider: state.ollamaProvider!,
          config: {},
          env: {} as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({ apiKey: undefined }),
          resolveProviderAuth: () => ({
            apiKey: undefined,
            discoveryApiKey: undefined,
            mode: "none",
            source: "none",
          }),
        }),
      ).resolves.toBeNull();
      expect(buildOllamaProviderMock).toHaveBeenCalledWith(undefined, { quiet: true });
    });
  });
}

export function describeVllmProviderDiscoveryContract() {
  const state = {} as DiscoveryState;

  describe("vllm provider discovery contract", () => {
    installDiscoveryHooks(state);

    it("keeps self-hosted discovery provider-owned", async () => {
      buildVllmProviderMock.mockResolvedValueOnce({
        baseUrl: "http://127.0.0.1:8000/v1",
        api: "openai-completions",
        models: [{ id: "meta-llama/Meta-Llama-3-8B-Instruct", name: "Meta Llama 3" }],
      });

      await expect(
        runCatalog(state, {
          provider: state.vllmProvider!,
          config: {},
          env: {
            VLLM_API_KEY: "env-vllm-key",
          } as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({
            apiKey: "VLLM_API_KEY",
            discoveryApiKey: "env-vllm-key",
          }),
          resolveProviderAuth: () => ({
            apiKey: "VLLM_API_KEY",
            discoveryApiKey: "env-vllm-key",
            mode: "api_key",
            source: "env",
          }),
        }),
      ).resolves.toEqual({
        provider: {
          baseUrl: "http://127.0.0.1:8000/v1",
          api: "openai-completions",
          apiKey: "VLLM_API_KEY",
          models: [{ id: "meta-llama/Meta-Llama-3-8B-Instruct", name: "Meta Llama 3" }],
        },
      });
      expect(buildVllmProviderMock).toHaveBeenCalledWith({
        apiKey: "env-vllm-key",
      });
    });
  });
}

export function describeSglangProviderDiscoveryContract() {
  const state = {} as DiscoveryState;

  describe("sglang provider discovery contract", () => {
    installDiscoveryHooks(state);

    it("keeps self-hosted discovery provider-owned", async () => {
      buildSglangProviderMock.mockResolvedValueOnce({
        baseUrl: "http://127.0.0.1:30000/v1",
        api: "openai-completions",
        models: [{ id: "Qwen/Qwen3-8B", name: "Qwen3-8B" }],
      });

      await expect(
        runCatalog(state, {
          provider: state.sglangProvider!,
          config: {},
          env: {
            SGLANG_API_KEY: "env-sglang-key",
          } as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({
            apiKey: "SGLANG_API_KEY",
            discoveryApiKey: "env-sglang-key",
          }),
          resolveProviderAuth: () => ({
            apiKey: "SGLANG_API_KEY",
            discoveryApiKey: "env-sglang-key",
            mode: "api_key",
            source: "env",
          }),
        }),
      ).resolves.toEqual({
        provider: {
          baseUrl: "http://127.0.0.1:30000/v1",
          api: "openai-completions",
          apiKey: "SGLANG_API_KEY",
          models: [{ id: "Qwen/Qwen3-8B", name: "Qwen3-8B" }],
        },
      });
      expect(buildSglangProviderMock).toHaveBeenCalledWith({
        apiKey: "env-sglang-key",
      });
    });
  });
}

export function describeMinimaxProviderDiscoveryContract() {
  const state = {} as DiscoveryState;

  describe("minimax provider discovery contract", () => {
    installDiscoveryHooks(state);

    it("keeps API catalog provider-owned", async () => {
      await expect(
        state.runProviderCatalog({
          provider: state.minimaxProvider!,
          config: {},
          env: {
            MINIMAX_API_KEY: "minimax-key",
          } as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({ apiKey: "minimax-key" }),
          resolveProviderAuth: () => ({
            apiKey: "minimax-key",
            discoveryApiKey: undefined,
            mode: "api_key",
            source: "env",
          }),
        }),
      ).resolves.toMatchObject({
        provider: {
          baseUrl: "https://api.minimax.io/anthropic",
          api: "anthropic-messages",
          authHeader: true,
          apiKey: "minimax-key",
          models: expect.arrayContaining([
            expect.objectContaining({ id: "MiniMax-M2.7" }),
            expect.objectContaining({ id: "MiniMax-M2.7-highspeed" }),
          ]),
        },
      });
    });

    it("keeps portal oauth marker fallback provider-owned", async () => {
      setRuntimeAuthStore({
        version: 1,
        profiles: {
          "minimax-portal:default": {
            type: "oauth",
            provider: "minimax-portal",
            access: "access-token",
            refresh: "refresh-token",
            expires: Date.now() + 60_000,
          },
        },
      });

      await expect(
        runCatalog(state, {
          provider: state.minimaxPortalProvider!,
          config: {},
          env: {} as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({ apiKey: undefined }),
          resolveProviderAuth: () => ({
            apiKey: "minimax-oauth",
            discoveryApiKey: "access-token",
            mode: "oauth",
            source: "profile",
            profileId: "minimax-portal:default",
          }),
        }),
      ).resolves.toMatchObject({
        provider: {
          baseUrl: "https://api.minimax.io/anthropic",
          api: "anthropic-messages",
          authHeader: true,
          apiKey: "minimax-oauth",
          models: expect.arrayContaining([expect.objectContaining({ id: "MiniMax-M2.7" })]),
        },
      });
    });

    it("keeps portal explicit base URL override provider-owned", async () => {
      await expect(
        state.runProviderCatalog({
          provider: state.minimaxPortalProvider!,
          config: {
            models: {
              providers: {
                "minimax-portal": {
                  baseUrl: "https://portal-proxy.example.com/anthropic",
                  apiKey: "explicit-key",
                  models: [],
                },
              },
            },
          },
          env: {} as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({ apiKey: undefined }),
          resolveProviderAuth: () => ({
            apiKey: undefined,
            discoveryApiKey: undefined,
            mode: "none",
            source: "none",
          }),
        }),
      ).resolves.toMatchObject({
        provider: {
          baseUrl: "https://portal-proxy.example.com/anthropic",
          apiKey: "explicit-key",
        },
      });
    });
  });
}

export function describeModelStudioProviderDiscoveryContract() {
  const state = {} as DiscoveryState;

  describe("modelstudio provider discovery contract", () => {
    installDiscoveryHooks(state);

    it("keeps catalog provider-owned", async () => {
      await expect(
        state.runProviderCatalog({
          provider: state.modelStudioProvider!,
          config: {
            models: {
              providers: {
                modelstudio: {
                  baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
                  models: [],
                },
              },
            },
          },
          env: {
            MODELSTUDIO_API_KEY: "modelstudio-key",
          } as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({ apiKey: "modelstudio-key" }),
          resolveProviderAuth: () => ({
            apiKey: "modelstudio-key",
            discoveryApiKey: undefined,
            mode: "api_key",
            source: "env",
          }),
        }),
      ).resolves.toMatchObject({
        provider: {
          baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
          api: "openai-completions",
          apiKey: "modelstudio-key",
          models: expect.arrayContaining([
            expect.objectContaining({ id: "qwen3.5-plus" }),
            expect.objectContaining({ id: "MiniMax-M2.5" }),
          ]),
        },
      });
    });
  });
}

export function describeCloudflareAiGatewayProviderDiscoveryContract() {
  const state = {} as DiscoveryState;

  describe("cloudflare-ai-gateway provider discovery contract", () => {
    beforeAll(async () => {
      vi.resetModules();
      ({ runProviderCatalog: state.runProviderCatalog } =
        await import("../../../src/plugins/provider-discovery.js"));
      const {
        __testing: cloudflareAiGatewayTesting,
        default: cloudflareAiGatewayPlugin,
      } = await importBundledProviderPlugin<{
        __testing: {
          resetDepsForTest: () => void;
          setDepsForTest: (
            overrides: Partial<{
              ensureAuthProfileStore: typeof ensureAuthProfileStoreMock;
              listProfilesForProvider: typeof listProfilesForProviderMock;
            }>,
          ) => void;
        };
        default: Parameters<typeof registerProviders>[0];
      }>(bundledProviderModules.cloudflareAiGatewayIndexModuleUrl);
      cloudflareAiGatewayTesting.resetDepsForTest();
      cloudflareAiGatewayTesting.setDepsForTest({
        ensureAuthProfileStore: ensureAuthProfileStoreMock,
        listProfilesForProvider: listProfilesForProviderMock,
      });
      state.cloudflareAiGatewayProvider = requireProvider(
        registerProviders(cloudflareAiGatewayPlugin),
        "cloudflare-ai-gateway",
      );
    });

    beforeEach(() => {
      setRuntimeAuthStore();
    });

    afterAll(() => {
      vi.restoreAllMocks();
      ensureAuthProfileStoreMock.mockReset();
      listProfilesForProviderMock.mockReset();
    });

    it("keeps catalog disabled without stored metadata", async () => {
      await expect(
        runCatalog(state, {
          provider: state.cloudflareAiGatewayProvider!,
          config: {},
          env: {} as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({ apiKey: undefined }),
          resolveProviderAuth: () => ({
            apiKey: undefined,
            discoveryApiKey: undefined,
            mode: "none",
            source: "none",
          }),
        }),
      ).resolves.toBeNull();
    });

    it("keeps env-managed catalog provider-owned", async () => {
      setRuntimeAuthStore({
        version: 1,
        profiles: {
          "cloudflare-ai-gateway:default": {
            type: "api_key",
            provider: "cloudflare-ai-gateway",
            keyRef: {
              source: "env",
              provider: "default",
              id: "CLOUDFLARE_AI_GATEWAY_API_KEY",
            },
            metadata: {
              accountId: "acc-123",
              gatewayId: "gw-456",
            },
          },
        },
      });

      await expect(
        runCatalog(state, {
          provider: state.cloudflareAiGatewayProvider!,
          config: {},
          env: {
            CLOUDFLARE_AI_GATEWAY_API_KEY: "secret-value",
          } as NodeJS.ProcessEnv,
          resolveProviderApiKey: () => ({ apiKey: undefined }),
          resolveProviderAuth: () => ({
            apiKey: undefined,
            discoveryApiKey: undefined,
            mode: "none",
            source: "none",
          }),
        }),
      ).resolves.toEqual({
        provider: {
          baseUrl: "https://gateway.ai.cloudflare.com/v1/acc-123/gw-456/anthropic",
          api: "anthropic-messages",
          apiKey: "CLOUDFLARE_AI_GATEWAY_API_KEY",
          models: [expect.objectContaining({ id: "claude-sonnet-4-5" })],
        },
      });
    });
  });
}
