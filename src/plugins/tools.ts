import type { AnyAgentTool } from "../agents/tools/common.js";
import {
  getExtensionHostPluginToolMeta,
  resolveExtensionHostPluginTools,
  type ExtensionHostPluginToolMeta,
} from "../extension-host/tool-runtime.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { applyTestPluginDefaults, normalizePluginsConfig } from "./config-state.js";
import { loadOpenClawPlugins } from "./loader.js";
import { createPluginLoaderLogger } from "./logger.js";
import type { OpenClawPluginToolContext } from "./types.js";

const log = createSubsystemLogger("plugins");

type PluginToolMeta = ExtensionHostPluginToolMeta;

export function getPluginToolMeta(tool: AnyAgentTool): PluginToolMeta | undefined {
  return getExtensionHostPluginToolMeta(tool);
}

export function resolvePluginTools(params: {
  context: OpenClawPluginToolContext;
  existingToolNames?: Set<string>;
  toolAllowlist?: string[];
  suppressNameConflicts?: boolean;
  env?: NodeJS.ProcessEnv;
}): AnyAgentTool[] {
  // Fast path: when plugins are effectively disabled, avoid discovery/jiti entirely.
  // This matters a lot for unit tests and for tool construction hot paths.
  const env = params.env ?? process.env;
  const effectiveConfig = applyTestPluginDefaults(params.context.config ?? {}, env);
  const normalized = normalizePluginsConfig(effectiveConfig.plugins);
  if (!normalized.enabled) {
    return [];
  }

  const registry = loadOpenClawPlugins({
    config: effectiveConfig,
    workspaceDir: params.context.workspaceDir,
    env,
    logger: createPluginLoaderLogger(log),
  });

  return resolveExtensionHostPluginTools({
    registry,
    context: params.context,
    existingToolNames: params.existingToolNames,
    toolAllowlist: params.toolAllowlist,
    suppressNameConflicts: params.suppressNameConflicts,
  });
}
