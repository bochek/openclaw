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
    // Emit a deprecation warning: ensurePluginRegistryLoaded() was removed to avoid
    // pulling plugins/loader.ts → jiti at startup (slow on low-powered devices).
    // OPENCLAW_EAGER_CHANNEL_OPTIONS no longer force-loads plugin channels; plugin IDs
    // are only included if the registry was already populated by another code path.
    process.emitWarning(
      "OPENCLAW_EAGER_CHANNEL_OPTIONS no longer force-loads plugin channels at startup. " +
        "Plugin IDs are only included if the registry was pre-loaded by another means. " +
        "Remove this env var to silence this warning.",
      { code: "OPENCLAW_EAGER_CHANNEL_OPTIONS_DEPRECATED" },
    );
    const pluginIds = listChannelPlugins().map((plugin) => plugin.id);
    return dedupe([...base, ...pluginIds]);
  }
  return base;
}

export function formatCliChannelOptions(extra: string[] = []): string {
  return [...extra, ...resolveCliChannelOptions()].join("|");
}
