import fs from "node:fs";
import path from "node:path";
import type { PluginRegistry } from "../plugins/registry.js";
import type { PluginDiagnostic } from "../plugins/types.js";
import type { ExtensionHostProvenanceIndex } from "./loader-policy.js";

function safeRealpathOrResolve(value: string): string {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function matchesPathMatcher(
  matcher: { exact: Set<string>; dirs: string[] },
  sourcePath: string,
): boolean {
  if (matcher.exact.has(sourcePath)) {
    return true;
  }
  return matcher.dirs.some(
    (dirPath) => sourcePath === dirPath || sourcePath.startsWith(`${dirPath}/`),
  );
}

function isTrackedByProvenance(params: {
  pluginId: string;
  source: string;
  index: ExtensionHostProvenanceIndex;
  env: NodeJS.ProcessEnv;
}): boolean {
  const sourcePath = params.source.startsWith("~")
    ? `${params.env.HOME ?? ""}${params.source.slice(1)}`
    : params.source;
  const installRule = params.index.installRules.get(params.pluginId);
  if (installRule) {
    if (installRule.trackedWithoutPaths) {
      return true;
    }
    if (matchesPathMatcher(installRule.matcher, sourcePath)) {
      return true;
    }
  }
  return matchesPathMatcher(params.index.loadPathMatcher, sourcePath);
}

export function resolveExtensionHostFinalizationPolicy(params: {
  registry: PluginRegistry;
  memorySlot?: string | null;
  memorySlotMatched: boolean;
  provenance: ExtensionHostProvenanceIndex;
  env: NodeJS.ProcessEnv;
}): {
  diagnostics: PluginDiagnostic[];
  warningMessages: string[];
} {
  const diagnostics: PluginDiagnostic[] = [];
  const warningMessages: string[] = [];

  if (typeof params.memorySlot === "string" && !params.memorySlotMatched) {
    diagnostics.push({
      level: "warn",
      message: `memory slot plugin not found or not marked as memory: ${params.memorySlot}`,
    });
  }

  for (const plugin of params.registry.plugins) {
    if (plugin.status !== "loaded" || plugin.origin === "bundled") {
      continue;
    }
    if (
      isTrackedByProvenance({
        pluginId: plugin.id,
        source: plugin.source,
        index: params.provenance,
        env: params.env,
      })
    ) {
      continue;
    }
    const message =
      "loaded without install/load-path provenance; treat as untracked local code and pin trust via plugins.allow or install records";
    diagnostics.push({
      level: "warn",
      pluginId: plugin.id,
      source: plugin.source,
      message,
    });
    warningMessages.push(
      `[plugins] ${plugin.id}: ${message} (${safeRealpathOrResolve(plugin.source)})`,
    );
  }

  return { diagnostics, warningMessages };
}
