import type { PluginRegistry } from "../plugins/registry.js";
import type { ProviderPlugin } from "../plugins/types.js";

export function resolveExtensionHostProviders(params: {
  registry: Pick<PluginRegistry, "providers">;
}): ProviderPlugin[] {
  return params.registry.providers.map((entry) => ({
    ...entry.provider,
    pluginId: entry.pluginId,
  }));
}
