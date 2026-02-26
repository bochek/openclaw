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
    // CHANGED SEMANTIC: ensurePluginRegistryLoaded() is intentionally NOT called
    // here to avoid pulling in plugins/loader.ts → jiti at startup (slow on
    // low-powered devices). As a result, OPENCLAW_EAGER_CHANNEL_OPTIONS is
    // effectively a no-op for its original purpose of force-loading all plugins
    // into the option list before Commander parses args. Plugin IDs are only
    // included here if the registry was already populated by some other means
    // (e.g. the preaction hook for a real command). If this env var behaviour is
    // needed, restore the ensurePluginRegistryLoaded() call explicitly.
    const pluginIds = listChannelPlugins().map((plugin) => plugin.id);
    return dedupe([...base, ...pluginIds]);
  }
  return base;
}

export function formatCliChannelOptions(extra: string[] = []): string {
  return [...extra, ...resolveCliChannelOptions()].join("|");
}
