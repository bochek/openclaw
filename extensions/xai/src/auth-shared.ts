import {
  ensureAuthProfileStore,
  listProfilesForProvider,
  resolveApiKeyForProfile,
} from "openclaw/plugin-sdk/agent-runtime";
import type { OpenClawConfig } from "openclaw/plugin-sdk/plugin-entry";
import {
  readConfiguredSecretString,
  readProviderEnvValue,
  resolveProviderWebSearchPluginConfig,
} from "openclaw/plugin-sdk/provider-web-search";

export function readLegacyGrokApiKey(cfg?: OpenClawConfig): string | undefined {
  const search = cfg?.tools?.web?.search;
  if (!search || typeof search !== "object") {
    return undefined;
  }
  const grok = (search as Record<string, unknown>).grok;
  return readConfiguredSecretString(
    grok && typeof grok === "object" ? (grok as Record<string, unknown>).apiKey : undefined,
    "tools.web.search.grok.apiKey",
  );
}

export function readPluginXaiWebSearchApiKey(cfg?: OpenClawConfig): string | undefined {
  return readConfiguredSecretString(
    resolveProviderWebSearchPluginConfig(cfg as Record<string, unknown> | undefined, "xai")?.apiKey,
    "plugins.entries.xai.config.webSearch.apiKey",
  );
}

export function resolveConfiguredXaiApiKey(cfg?: OpenClawConfig): string | undefined {
  return readPluginXaiWebSearchApiKey(cfg) ?? readLegacyGrokApiKey(cfg);
}

export function hasXaiProfileCredential(agentDir?: string): boolean {
  const store = ensureAuthProfileStore(agentDir, {
    allowKeychainPrompt: false,
  });
  return listProfilesForProvider(store, "xai").length > 0;
}

export async function resolveXaiApiKeyFromProfiles(params: {
  config?: OpenClawConfig;
  agentDir?: string;
}): Promise<string | undefined> {
  const store = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  const profileIds = listProfilesForProvider(store, "xai");
  for (const profileId of profileIds) {
    const resolved = await resolveApiKeyForProfile({
      cfg: params.config,
      store,
      profileId,
      agentDir: params.agentDir,
    });
    const apiKey = resolved?.apiKey?.trim();
    if (apiKey) {
      return apiKey;
    }
  }
  return undefined;
}

export async function resolveXaiApiKey(params: {
  sourceConfig?: OpenClawConfig;
  runtimeConfig?: OpenClawConfig;
  agentDir?: string;
}): Promise<string | undefined> {
  return (
    resolveConfiguredXaiApiKey(params.runtimeConfig) ??
    resolveConfiguredXaiApiKey(params.sourceConfig) ??
    readProviderEnvValue(["XAI_API_KEY"]) ??
    (await resolveXaiApiKeyFromProfiles({
      config: params.runtimeConfig ?? params.sourceConfig,
      agentDir: params.agentDir,
    }))
  );
}
