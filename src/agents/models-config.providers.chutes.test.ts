import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHUTES_BASE_URL } from "./chutes-models.js";
import { resolveOAuthApiKeyMarker } from "./model-auth-markers.js";
import { resolveImplicitProvidersForTest } from "./models-config.e2e-harness.js";

const CHUTES_OAUTH_MARKER = resolveOAuthApiKeyMarker("chutes");
const TEST_ENV = {
  VITEST: "true",
  NODE_ENV: "test",
} as NodeJS.ProcessEnv;

function createTempAgentDir() {
  return mkdtempSync(join(tmpdir(), "openclaw-test-"));
}

type ChutesAuthProfiles = {
  [profileId: string]:
    | {
        type: "api_key";
        provider: "chutes";
        key: string;
      }
    | {
        type: "oauth";
        provider: "chutes";
        access: string;
        refresh: string;
        expires: number;
      };
};

function createChutesApiKeyProfile(key = "chutes-live-api-key") {
  return {
    type: "api_key" as const,
    provider: "chutes" as const,
    key,
  };
}

function createChutesOAuthProfile(access = "oauth-access-token") {
  return {
    type: "oauth" as const,
    provider: "chutes" as const,
    access,
    refresh: "oauth-refresh-token",
    expires: Date.now() + 60_000,
  };
}

async function writeChutesAuthProfiles(agentDir: string, profiles: ChutesAuthProfiles) {
  await writeFile(
    join(agentDir, "auth-profiles.json"),
    JSON.stringify(
      {
        version: 1,
        profiles,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function resolveChutesProvidersForProfiles(
  profiles: ChutesAuthProfiles,
  env: NodeJS.ProcessEnv = TEST_ENV,
) {
  const agentDir = createTempAgentDir();
  await writeChutesAuthProfiles(agentDir, profiles);
  return resolveImplicitProvidersForTest({ agentDir, env, onlyPluginIds: ["chutes"] });
}

function expectChutesApiKeyProvider(
  providers: Awaited<ReturnType<typeof resolveImplicitProvidersForTest>>,
  apiKey = "chutes-live-api-key",
) {
  expect(providers?.chutes?.baseUrl).toBe(CHUTES_BASE_URL);
  expect(providers?.chutes?.apiKey).toBe(apiKey);
  expect(providers?.chutes?.apiKey).not.toBe(CHUTES_OAUTH_MARKER);
}

function expectChutesOAuthMarkerProvider(
  providers: Awaited<ReturnType<typeof resolveImplicitProvidersForTest>>,
) {
  expect(providers?.chutes?.baseUrl).toBe(CHUTES_BASE_URL);
  expect(providers?.chutes?.apiKey).toBe(CHUTES_OAUTH_MARKER);
}

async function withRealChutesDiscovery<T>(
  run: (fetchMock: ReturnType<typeof vi.fn>) => Promise<T>,
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ id: "chutes/private-model" }] }),
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return run(fetchMock);
}

describe("chutes implicit provider auth mode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("auto-loads bundled chutes discovery for env api keys", async () => {
    const agentDir = createTempAgentDir();
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {
        ...TEST_ENV,
        CHUTES_API_KEY: "env-chutes-api-key",
      } as NodeJS.ProcessEnv,
      onlyPluginIds: ["chutes"],
    });

    expect(providers?.chutes?.baseUrl).toBe(CHUTES_BASE_URL);
    expect(providers?.chutes?.apiKey).toBe("CHUTES_API_KEY");
  });

  it("keeps api_key-backed chutes profiles on the api-key loader path", async () => {
    const providers = await resolveChutesProvidersForProfiles({
      "chutes:default": createChutesApiKeyProfile(),
    });
    expectChutesApiKeyProvider(providers);
  });

  it("keeps api_key precedence when oauth profile is inserted first", async () => {
    const providers = await resolveChutesProvidersForProfiles({
      "chutes:oauth": createChutesOAuthProfile(),
      "chutes:default": createChutesApiKeyProfile(),
    });
    expectChutesApiKeyProvider(providers);
  });

  it("keeps api_key precedence when api_key profile is inserted first", async () => {
    const providers = await resolveChutesProvidersForProfiles({
      "chutes:default": createChutesApiKeyProfile(),
      "chutes:oauth": createChutesOAuthProfile(),
    });
    expectChutesApiKeyProvider(providers);
  });

  it("forwards oauth access token to chutes model discovery", async () => {
    await withRealChutesDiscovery(async (fetchMock) => {
      vi.stubEnv("VITEST", "");
      vi.stubEnv("NODE_ENV", "development");
      const providers = await resolveChutesProvidersForProfiles(
        {
          "chutes:default": createChutesOAuthProfile("my-chutes-access-token"),
        },
        {},
      );
      expectChutesOAuthMarkerProvider(providers);
      const chutesCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("chutes.ai"));
      expect(chutesCalls.length).toBeGreaterThan(0);
      const request = chutesCalls[0]?.[1] as { headers?: Record<string, string> } | undefined;
      expect(request?.headers?.Authorization).toBe("Bearer my-chutes-access-token");
    });
  });

  it("uses CHUTES_OAUTH_MARKER only for oauth-backed chutes profiles", async () => {
    const providers = await resolveChutesProvidersForProfiles({
      "chutes:default": createChutesOAuthProfile(),
    });
    expectChutesOAuthMarkerProvider(providers);
  });
});
