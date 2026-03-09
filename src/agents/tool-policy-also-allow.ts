import type { AgentToolsConfig, ToolPolicyConfig, ToolsConfig } from "../config/types.tools.js";
import { CONFIGURED_TOOL_SECTION_EXPOSURES } from "./tool-config-exposure.js";

type AlsoAllowConfig = Pick<ToolPolicyConfig, "alsoAllow">;

export function mergeUniqueToolNames(...lists: Array<string[] | undefined>): string[] | undefined {
  const merged: string[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const raw of list) {
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      if (trimmed) {
        merged.push(trimmed);
      }
    }
  }
  return merged.length > 0 ? Array.from(new Set(merged)) : undefined;
}

export function mergeAlsoAllowIntoAllowlist(params: {
  allow?: string[];
  alsoAllow?: string[];
  assumeAllowAll?: boolean;
}): string[] | undefined {
  if (!Array.isArray(params.alsoAllow) || params.alsoAllow.length === 0) {
    return params.allow;
  }
  if (!Array.isArray(params.allow) || params.allow.length === 0) {
    return params.assumeAllowAll ? mergeUniqueToolNames(["*"], params.alsoAllow) : params.allow;
  }
  return mergeUniqueToolNames(params.allow, params.alsoAllow);
}

export function resolveExplicitAlsoAllow(...configs: Array<AlsoAllowConfig | undefined>) {
  for (const config of configs) {
    if (Array.isArray(config?.alsoAllow) && config.alsoAllow.length > 0) {
      return config.alsoAllow;
    }
  }
  return undefined;
}

export function resolveImplicitToolSectionAlsoAllow(params: {
  globalTools?: ToolsConfig;
  agentTools?: AgentToolsConfig;
}): string[] | undefined {
  const exposures: string[][] = [];
  if (params.agentTools?.exec != null || params.globalTools?.exec != null) {
    exposures.push([...CONFIGURED_TOOL_SECTION_EXPOSURES.exec]);
  }
  if (params.agentTools?.fs != null || params.globalTools?.fs != null) {
    exposures.push([...CONFIGURED_TOOL_SECTION_EXPOSURES.fs]);
  }
  return mergeUniqueToolNames(...exposures);
}

export function resolveProfileAlsoAllow(params: {
  globalTools?: ToolsConfig;
  agentTools?: AgentToolsConfig;
}) {
  return mergeUniqueToolNames(
    resolveExplicitAlsoAllow(params.agentTools, params.globalTools),
    resolveImplicitToolSectionAlsoAllow(params),
  );
}

export function resolveProviderProfileAlsoAllow(params: {
  providerPolicy?: ToolPolicyConfig;
  agentProviderPolicy?: ToolPolicyConfig;
}) {
  return resolveExplicitAlsoAllow(params.agentProviderPolicy, params.providerPolicy);
}
