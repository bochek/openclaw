import type { OpenClawConfig } from "../../config/config.js";
import { resolveBundledWebSearchPluginId } from "../../plugins/bundled-web-search-provider-ids.js";
import { resolveRuntimeWebSearchProviders } from "../../plugins/web-search-providers.runtime.js";
import type { RuntimeWebSearchMetadata } from "../../secrets/runtime-web-tools.types.js";
import {
  resolveWebSearchDefinition,
  resolveWebSearchProviderId,
} from "../../web-search/runtime.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";
import { SEARCH_CACHE } from "./web-search-provider-common.js";

export function createWebSearchTool(options?: {
  config?: OpenClawConfig;
  sandboxed?: boolean;
  runtimeWebSearch?: RuntimeWebSearchMetadata;
}): AnyAgentTool | null {
  const runtimeProviderId =
    options?.runtimeWebSearch?.selectedProvider ?? options?.runtimeWebSearch?.providerConfigured;
  const hasActiveRuntimeProvider = runtimeProviderId
    ? resolveRuntimeWebSearchProviders({ config: options?.config }).some(
        (provider) => provider.id === runtimeProviderId,
      )
    : false;
  const resolved = resolveWebSearchDefinition({
    ...options,
    preferRuntimeProviders:
      hasActiveRuntimeProvider && !resolveBundledWebSearchPluginId(runtimeProviderId),
  });
  if (!resolved) {
    return null;
  }

  return {
    label: "Web Search",
    name: "web_search",
    description: resolved.definition.description,
    parameters: resolved.definition.parameters,
    execute: async (_toolCallId, args) => jsonResult(await resolved.definition.execute(args)),
  };
}

export const __testing = {
  SEARCH_CACHE,
  resolveSearchProvider: (search?: Parameters<typeof resolveWebSearchProviderId>[0]["search"]) =>
    resolveWebSearchProviderId({ search }),
};
