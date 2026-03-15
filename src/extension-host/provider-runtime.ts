import type { PluginRegistry } from "../plugins/registry.js";
import type { ProviderPlugin } from "../plugins/types.js";
import { listExtensionHostProviderRegistrations } from "./runtime-registry.js";

export function resolveExtensionHostProviders(params: {
  registry: Pick<PluginRegistry, "providers">;
}): ProviderPlugin[] {
  return listExtensionHostProviderRegistrations(params.registry).map((entry) => ({
    ...entry.provider,
    pluginId: entry.pluginId,
  }));
}
