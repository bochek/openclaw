import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MSTeamsConfig } from "../runtime-api.js";
import { setLoadMSTeamsSdkForTest, type MSTeamsTeamsSdk } from "./sdk.js";

const hostMockState = vi.hoisted(() => ({
  tokenError: null as Error | null,
}));

import { probeMSTeams } from "./probe.js";

function createMSTeamsSdkStub(): MSTeamsTeamsSdk {
  return {
    App: class {
      protected async getBotToken() {
        if (hostMockState.tokenError) {
          throw hostMockState.tokenError;
        }
        return { toString: () => "token" };
      }
      protected async getAppGraphToken() {
        if (hostMockState.tokenError) {
          throw hostMockState.tokenError;
        }
        return { toString: () => "token" };
      }
    } as unknown as MSTeamsTeamsSdk["App"],
    Client: class {} as unknown as MSTeamsTeamsSdk["Client"],
  };
}

describe("msteams probe", () => {
  beforeEach(() => {
    hostMockState.tokenError = null;
    vi.stubEnv("MSTEAMS_APP_ID", "");
    vi.stubEnv("MSTEAMS_APP_PASSWORD", "");
    vi.stubEnv("MSTEAMS_TENANT_ID", "");
    setLoadMSTeamsSdkForTest(async () => createMSTeamsSdkStub());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setLoadMSTeamsSdkForTest(undefined);
  });

  it("returns an error when credentials are missing", async () => {
    const cfg = { enabled: true } as unknown as MSTeamsConfig;
    await expect(probeMSTeams(cfg)).resolves.toMatchObject({
      ok: false,
    });
  });

  it("validates credentials by acquiring a token", async () => {
    const cfg = {
      enabled: true,
      appId: "app",
      appPassword: "pw",
      tenantId: "tenant",
    } as unknown as MSTeamsConfig;
    await expect(probeMSTeams(cfg)).resolves.toMatchObject({
      ok: true,
      appId: "app",
    });
  });

  it("returns a helpful error when token acquisition fails", async () => {
    hostMockState.tokenError = new Error("bad creds");
    const cfg = {
      enabled: true,
      appId: "app",
      appPassword: "pw",
      tenantId: "tenant",
    } as unknown as MSTeamsConfig;
    await expect(probeMSTeams(cfg)).resolves.toMatchObject({
      ok: false,
      appId: "app",
      error: "bad creds",
    });
  });
});
