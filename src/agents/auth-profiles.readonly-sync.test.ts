import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRuntimeAuthProfileStoreSnapshots,
  loadAuthProfileStoreForRuntime,
} from "./auth-profiles.js";
import { AUTH_STORE_VERSION } from "./auth-profiles/constants.js";
import { __testing as externalCliSyncTesting } from "./auth-profiles/external-cli-sync.js";
import type { AuthProfileStore, OAuthCredential } from "./auth-profiles/types.js";

const readMiniMaxCliCredentialsMock = vi.fn<() => OAuthCredential | null>(() => null);

describe("auth profiles read-only external CLI sync", () => {
  beforeEach(() => {
    clearRuntimeAuthProfileStoreSnapshots();
    readMiniMaxCliCredentialsMock.mockReset().mockReturnValue({
      type: "oauth",
      provider: "minimax-portal",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
    });
    externalCliSyncTesting.setExternalCliSyncProvidersForTests([
      {
        profileId: "minimax-portal:default",
        provider: "minimax-portal",
        readCredentials: () => readMiniMaxCliCredentialsMock(),
      },
    ]);
  });

  afterEach(() => {
    externalCliSyncTesting.setExternalCliSyncProvidersForTests(null);
    clearRuntimeAuthProfileStoreSnapshots();
    vi.clearAllMocks();
  });

  it("syncs external CLI credentials in-memory without writing auth-profiles.json in read-only mode", () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-auth-readonly-sync-"));
    try {
      const authPath = path.join(agentDir, "auth-profiles.json");
      const baseline: AuthProfileStore = {
        version: AUTH_STORE_VERSION,
        profiles: {
          "openai:default": {
            type: "api_key",
            provider: "openai",
            key: "sk-test",
          },
        },
      };
      fs.writeFileSync(authPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");

      const loaded = loadAuthProfileStoreForRuntime(agentDir, { readOnly: true });

      expect(readMiniMaxCliCredentialsMock).toHaveBeenCalled();
      expect(loaded.profiles["minimax-portal:default"]).toMatchObject({
        type: "oauth",
        provider: "minimax-portal",
      });

      const persisted = JSON.parse(fs.readFileSync(authPath, "utf8")) as AuthProfileStore;
      expect(persisted.profiles["minimax-portal:default"]).toBeUndefined();
      expect(persisted.profiles["openai:default"]).toMatchObject({
        type: "api_key",
        provider: "openai",
        key: "sk-test",
      });
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });
});
