import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfileStore, OAuthCredential } from "./auth-profiles/types.js";

const mocks = vi.hoisted(() => ({
  readCodexCliCredentialsCached: vi.fn<() => OAuthCredential | null>(() => null),
  readMiniMaxCliCredentialsCached: vi.fn<() => OAuthCredential | null>(() => null),
}));

let syncExternalCliCredentials: typeof import("./auth-profiles/external-cli-sync.js").syncExternalCliCredentials;
let shouldReplaceStoredOAuthCredential: typeof import("./auth-profiles/external-cli-sync.js").shouldReplaceStoredOAuthCredential;
let externalCliSyncTesting: typeof import("./auth-profiles/external-cli-sync.js").__testing;
let CODEX_CLI_PROFILE_ID: typeof import("./auth-profiles/constants.js").CODEX_CLI_PROFILE_ID;
let OPENAI_CODEX_DEFAULT_PROFILE_ID: typeof import("./auth-profiles/constants.js").OPENAI_CODEX_DEFAULT_PROFILE_ID;
let MINIMAX_CLI_PROFILE_ID: typeof import("./auth-profiles/constants.js").MINIMAX_CLI_PROFILE_ID;
({
  syncExternalCliCredentials,
  shouldReplaceStoredOAuthCredential,
  __testing: externalCliSyncTesting,
} =
  await import("./auth-profiles/external-cli-sync.js"));
({ CODEX_CLI_PROFILE_ID, OPENAI_CODEX_DEFAULT_PROFILE_ID, MINIMAX_CLI_PROFILE_ID } =
  await import("./auth-profiles/constants.js"));

function makeOAuthCredential(
  overrides: Partial<OAuthCredential> & Pick<OAuthCredential, "provider">,
) {
  return {
    type: "oauth" as const,
    provider: overrides.provider,
    access: overrides.access ?? `${overrides.provider}-access`,
    refresh: overrides.refresh ?? `${overrides.provider}-refresh`,
    expires: overrides.expires ?? Date.now() + 60_000,
    accountId: overrides.accountId,
    email: overrides.email,
    enterpriseUrl: overrides.enterpriseUrl,
    projectId: overrides.projectId,
  };
}

function makeStore(profileId?: string, credential?: OAuthCredential): AuthProfileStore {
  return {
    version: 1,
    profiles: profileId && credential ? { [profileId]: credential } : {},
  };
}

function getProviderCases() {
  return [
    {
      label: "Codex",
      profileId: OPENAI_CODEX_DEFAULT_PROFILE_ID,
      provider: "openai-codex" as const,
      readMock: mocks.readCodexCliCredentialsCached,
      legacyProfileId: CODEX_CLI_PROFILE_ID,
    },
    {
      label: "MiniMax",
      profileId: MINIMAX_CLI_PROFILE_ID,
      provider: "minimax-portal" as const,
      readMock: mocks.readMiniMaxCliCredentialsCached,
    },
  ];
}

describe("syncExternalCliCredentials", () => {
  beforeEach(() => {
    const providerCases = getProviderCases();
    externalCliSyncTesting.setExternalCliSyncProvidersForTests(
      providerCases.map((providerCase) => ({
        profileId: providerCase.profileId,
        provider: providerCase.provider,
        readCredentials: () => providerCase.readMock(),
      })),
    );
    for (const providerCase of providerCases) {
      providerCase.readMock.mockReset().mockReturnValue(null);
    }
  });

  afterEach(() => {
    externalCliSyncTesting.setExternalCliSyncProvidersForTests(null);
  });

  describe("shouldReplaceStoredOAuthCredential", () => {
    it("keeps equivalent stored credentials", () => {
      const stored = makeOAuthCredential({ provider: "openai-codex", access: "a", refresh: "r" });
      const incoming = makeOAuthCredential({ provider: "openai-codex", access: "a", refresh: "r" });

      expect(shouldReplaceStoredOAuthCredential(stored, incoming)).toBe(false);
    });

    it("keeps the newer stored credential", () => {
      const incoming = makeOAuthCredential({
        provider: "openai-codex",
        expires: Date.now() + 60_000,
      });
      const stored = makeOAuthCredential({
        provider: "openai-codex",
        access: "fresh-access",
        refresh: "fresh-refresh",
        expires: Date.now() + 5 * 24 * 60 * 60_000,
      });

      expect(shouldReplaceStoredOAuthCredential(stored, incoming)).toBe(false);
    });

    it("replaces when incoming credentials are fresher", () => {
      const stored = makeOAuthCredential({
        provider: "openai-codex",
        expires: Date.now() + 60_000,
      });
      const incoming = makeOAuthCredential({
        provider: "openai-codex",
        access: "new-access",
        refresh: "new-refresh",
        expires: Date.now() + 5 * 24 * 60 * 60_000,
      });

      expect(shouldReplaceStoredOAuthCredential(stored, incoming)).toBe(true);
      expect(shouldReplaceStoredOAuthCredential(undefined, incoming)).toBe(true);
    });
  });

  it.each([{ providerLabel: "Codex" }, { providerLabel: "MiniMax" }])(
    "syncs $providerLabel CLI credentials into the target auth profile",
    ({ providerLabel }) => {
      const providerCase = getProviderCases().find((entry) => entry.label === providerLabel);
      expect(providerCase).toBeDefined();
      const current = providerCase!;
      const expires = Date.now() + 60_000;
      current.readMock.mockReturnValue(
        makeOAuthCredential({
          provider: current.provider,
          access: `${current.provider}-access-token`,
          refresh: `${current.provider}-refresh-token`,
          expires,
          accountId: "acct_123",
        }),
      );

      const store = makeStore();

      const mutated = syncExternalCliCredentials(store);

      expect(mutated).toBe(true);
      expect(current.readMock).toHaveBeenCalledTimes(1);
      const syncedProfile = store.profiles[current.profileId];
      expect(syncedProfile?.type).toBe("oauth");
      expect(syncedProfile?.provider).toBe(current.provider);
      expect(syncedProfile?.access).toBe(`${current.provider}-access-token`);
      expect(syncedProfile?.refresh).toBe(`${current.provider}-refresh-token`);
      expect(syncedProfile?.expires).toBe(expires);
      expect(syncedProfile?.accountId).toBe("acct_123");
      if (current.legacyProfileId) {
        expect(store.profiles[current.legacyProfileId]).toBeUndefined();
      }
    },
  );

  it("refreshes stored Codex expiry from external CLI even when the cached profile looks fresh", () => {
    const staleExpiry = Date.now() + 30 * 60_000;
    const freshExpiry = Date.now() + 5 * 24 * 60 * 60_000;
    mocks.readCodexCliCredentialsCached.mockReturnValue(
      makeOAuthCredential({
        provider: "openai-codex",
        access: "new-access-token",
        refresh: "new-refresh-token",
        expires: freshExpiry,
        accountId: "acct_456",
      }),
    );

    const store = makeStore(
      OPENAI_CODEX_DEFAULT_PROFILE_ID,
      makeOAuthCredential({
        provider: "openai-codex",
        access: "old-access-token",
        refresh: "old-refresh-token",
        expires: staleExpiry,
        accountId: "acct_456",
      }),
    );

    const mutated = syncExternalCliCredentials(store);

    expect(mutated).toBe(true);
    const syncedProfile = store.profiles[OPENAI_CODEX_DEFAULT_PROFILE_ID];
    expect(syncedProfile?.access).toBe("new-access-token");
    expect(syncedProfile?.refresh).toBe("new-refresh-token");
    expect(syncedProfile?.expires).toBe(freshExpiry);
  });

  it.each([{ providerLabel: "Codex" }, { providerLabel: "MiniMax" }])(
    "does not overwrite newer stored $providerLabel credentials",
    ({ providerLabel }) => {
      const providerCase = getProviderCases().find((entry) => entry.label === providerLabel);
      expect(providerCase).toBeDefined();
      const current = providerCase!;
      const staleExpiry = Date.now() + 30 * 60_000;
      const freshExpiry = Date.now() + 5 * 24 * 60 * 60_000;
      current.readMock.mockReturnValue(
        makeOAuthCredential({
          provider: current.provider,
          access: `stale-${current.provider}-access-token`,
          refresh: `stale-${current.provider}-refresh-token`,
          expires: staleExpiry,
          accountId: "acct_789",
        }),
      );

      const store = makeStore(
        current.profileId,
        makeOAuthCredential({
          provider: current.provider,
          access: `fresh-${current.provider}-access-token`,
          refresh: `fresh-${current.provider}-refresh-token`,
          expires: freshExpiry,
          accountId: "acct_789",
        }),
      );

      const mutated = syncExternalCliCredentials(store);

      expect(mutated).toBe(false);
      const syncedProfile = store.profiles[current.profileId];
      expect(syncedProfile?.access).toBe(`fresh-${current.provider}-access-token`);
      expect(syncedProfile?.refresh).toBe(`fresh-${current.provider}-refresh-token`);
      expect(syncedProfile?.expires).toBe(freshExpiry);
    },
  );
});
