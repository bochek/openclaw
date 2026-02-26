import { listChannelPluginCatalogEntries } from "../channels/plugins/catalog.js";
import { listChannelPlugins } from "../channels/plugins/index.js";
import { CHAT_CHANNEL_ORDER } from "../channels/registry.js";
import { isTruthyEnvValue } from "../infra/env.js";
// NOTE: plugin-registry.ts is NOT imported here to avoid pulling in
// plugins/loader.ts → jiti at startup (which is slow on low-powered devices).
// The OPENCLAW_EAGER_CHANNEL_OPTIONS path reads from the registry without force-loading.

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    resolved.push(value);
  }
  return resolved;
}

export function resolveCliChannelOptions(): string[] {
  const catalog = listChannelPluginCatalogEntries().map((entry) => entry.id);
  const base = dedupe([...CHAT_CHANNEL_ORDER, ...catalog]);
  if (isTruthyEnvValue(process.env.OPENCLAW_EAGER_CHANNEL_OPTIONS)) {
    // Reads plugin channel IDs from the registry if already populated.
    // (ensurePluginRegistryLoaded is intentionally not called here to avoid
    // loading jiti; plugins are loaded by the preaction hook for real commands.)
    const pluginIds = listChannelPlugins().map((plugin) => plugin.id);
    return dedupe([...base, ...pluginIds]);
  }
  return base;
}

export function formatCliChannelOptions(extra: string[] = []): string {
  return [...extra, ...resolveCliChannelOptions()].join("|");
}
