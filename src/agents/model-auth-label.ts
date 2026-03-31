import type { OpenClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import { normalizeOptionalSecretInput } from "../utils/normalize-secret-input.js";
import {
  ensureAuthProfileStore,
  resolveAuthProfileDisplayLabel,
  resolveAuthProfileOrder,
} from "./auth-profiles.js";
import { resolveEnvApiKey } from "./model-auth-env.js";
import { isKnownEnvApiKeyMarker, isNonSecretApiKeyMarker } from "./model-auth-markers.js";
import type { EnvApiKeyResult } from "./model-auth-env.js";
import { normalizeProviderId } from "./model-selection.js";
import { findNormalizedProviderValue } from "./provider-id.js";

function resolveUsableCustomProviderApiKey(params: {
  cfg?: OpenClawConfig;
  provider: string;
  env?: NodeJS.ProcessEnv;
}): EnvApiKeyResult | null {
  const providerConfig = findNormalizedProviderValue(params.cfg?.models?.providers, params.provider);
  const customKey = normalizeOptionalSecretInput(providerConfig?.apiKey);
  if (!customKey) {
    return null;
  }
  if (!isNonSecretApiKeyMarker(customKey)) {
    return { apiKey: customKey, source: "models.json" };
  }
  if (!isKnownEnvApiKeyMarker(customKey)) {
    return null;
  }
  const envValue = normalizeOptionalSecretInput((params.env ?? process.env)[customKey]);
  return envValue ? { apiKey: envValue, source: `env: ${customKey}` } : null;
}

const defaultModelAuthLabelDeps = {
  ensureAuthProfileStore,
  resolveAuthProfileDisplayLabel,
  resolveAuthProfileOrder,
  resolveEnvApiKey,
  resolveUsableCustomProviderApiKey,
};
let modelAuthLabelDeps = defaultModelAuthLabelDeps;

export function resolveModelAuthLabel(params: {
  provider?: string;
  cfg?: OpenClawConfig;
  sessionEntry?: SessionEntry;
  agentDir?: string;
}): string | undefined {
  const resolvedProvider = params.provider?.trim();
  if (!resolvedProvider) {
    return undefined;
  }

  const providerKey = normalizeProviderId(resolvedProvider);
  const store = modelAuthLabelDeps.ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  const profileOverride = params.sessionEntry?.authProfileOverride?.trim();
  const order = modelAuthLabelDeps.resolveAuthProfileOrder({
    cfg: params.cfg,
    store,
    provider: providerKey,
    preferredProfile: profileOverride,
  });
  const candidates = [profileOverride, ...order].filter(Boolean) as string[];

  for (const profileId of candidates) {
    const profile = store.profiles[profileId];
    if (!profile || normalizeProviderId(profile.provider) !== providerKey) {
      continue;
    }
    const label = modelAuthLabelDeps.resolveAuthProfileDisplayLabel({
      cfg: params.cfg,
      store,
      profileId,
    });
    if (profile.type === "oauth") {
      return `oauth${label ? ` (${label})` : ""}`;
    }
    if (profile.type === "token") {
      return `token${label ? ` (${label})` : ""}`;
    }
    return `api-key${label ? ` (${label})` : ""}`;
  }

  const envKey = modelAuthLabelDeps.resolveEnvApiKey(providerKey);
  if (envKey?.apiKey) {
    if (envKey.source.includes("OAUTH_TOKEN")) {
      return `oauth (${envKey.source})`;
    }
    return `api-key (${envKey.source})`;
  }

  const customKey = modelAuthLabelDeps.resolveUsableCustomProviderApiKey({
    cfg: params.cfg,
    provider: providerKey,
  });
  if (customKey) {
    return `api-key (models.json)`;
  }

  return "unknown";
}

export const __testing = {
  setDepsForTest(overrides?: Partial<typeof defaultModelAuthLabelDeps>) {
    modelAuthLabelDeps = overrides
      ? { ...defaultModelAuthLabelDeps, ...overrides }
      : defaultModelAuthLabelDeps;
  },
};
