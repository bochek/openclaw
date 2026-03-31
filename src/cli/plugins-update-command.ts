import { loadConfig, readConfigFileSnapshot, replaceConfigFile } from "../config/config.js";
import type { HookInstallRecord } from "../config/types.hooks.js";
import type { PluginInstallRecord } from "../config/types.plugins.js";
import { updateNpmInstalledHookPacks } from "../hooks/update.js";
import { parseRegistryNpmSpec } from "../infra/npm-registry-spec.js";
import { updateNpmInstalledPlugins } from "../plugins/update.js";
import { defaultRuntime } from "../runtime.js";
import { theme } from "../terminal/theme.js";
import {
  extractInstalledNpmHookPackageName,
  extractInstalledNpmPackageName,
} from "./plugins-command-helpers.js";
import { promptYesNo } from "./prompt.js";

type PluginUpdateDeps = {
  updateNpmInstalledPlugins: typeof import("../plugins/update.js").updateNpmInstalledPlugins;
  updateNpmInstalledHookPacks: typeof import("../hooks/update.js").updateNpmInstalledHookPacks;
  loadConfig: typeof import("../config/config.js").loadConfig;
  readConfigFileSnapshot: typeof import("../config/config.js").readConfigFileSnapshot;
  replaceConfigFile: typeof import("../config/config.js").replaceConfigFile;
  runtime: typeof import("../runtime.js").defaultRuntime;
};

const defaultPluginUpdateDeps: PluginUpdateDeps = {
  updateNpmInstalledPlugins,
  updateNpmInstalledHookPacks,
  loadConfig,
  readConfigFileSnapshot,
  replaceConfigFile,
  runtime: defaultRuntime,
};

let pluginUpdateDeps: PluginUpdateDeps = defaultPluginUpdateDeps;

function resolvePluginUpdateSelection(params: {
  installs: Record<string, PluginInstallRecord>;
  rawId?: string;
  all?: boolean;
}): { pluginIds: string[]; specOverrides?: Record<string, string> } {
  if (params.all) {
    return { pluginIds: Object.keys(params.installs) };
  }
  if (!params.rawId) {
    return { pluginIds: [] };
  }

  const parsedSpec = parseRegistryNpmSpec(params.rawId);
  if (!parsedSpec || parsedSpec.selectorKind === "none") {
    return { pluginIds: [params.rawId] };
  }

  const matches = Object.entries(params.installs).filter(([, install]) => {
    return extractInstalledNpmPackageName(install) === parsedSpec.name;
  });
  if (matches.length !== 1) {
    return { pluginIds: [params.rawId] };
  }

  const [pluginId] = matches[0];
  if (!pluginId) {
    return { pluginIds: [params.rawId] };
  }
  return {
    pluginIds: [pluginId],
    specOverrides: {
      [pluginId]: parsedSpec.raw,
    },
  };
}

function resolveHookPackUpdateSelection(params: {
  installs: Record<string, HookInstallRecord>;
  rawId?: string;
  all?: boolean;
}): { hookIds: string[]; specOverrides?: Record<string, string> } {
  if (params.all) {
    return { hookIds: Object.keys(params.installs) };
  }
  const rawId = params.rawId?.trim();
  if (!rawId) {
    return { hookIds: [] };
  }

  for (const [hookId, install] of Object.entries(params.installs)) {
    if (hookId === rawId || install.spec === rawId || install.resolvedName === rawId) {
      return { hookIds: [hookId] };
    }
  }

  const parsedSpec = parseRegistryNpmSpec(rawId);
  if (!parsedSpec || parsedSpec.selectorKind === "none") {
    return { hookIds: [] };
  }

  const matches = Object.entries(params.installs).filter(([, install]) => {
    return extractInstalledNpmHookPackageName(install) === parsedSpec.name;
  });
  if (matches.length !== 1) {
    return { hookIds: [] };
  }

  const [hookId] = matches[0];
  if (!hookId) {
    return { hookIds: [] };
  }
  return {
    hookIds: [hookId],
    specOverrides: {
      [hookId]: parsedSpec.raw,
    },
  };
}

export async function runPluginUpdateCommand(params: {
  id?: string;
  opts: { all?: boolean; dryRun?: boolean };
}) {
  const runtime = pluginUpdateDeps.runtime;
  const sourceSnapshotPromise = pluginUpdateDeps.readConfigFileSnapshot().catch(() => null);
  const cfg = pluginUpdateDeps.loadConfig();
  const logger = {
    info: (msg: string) => runtime.log(msg),
    warn: (msg: string) => runtime.log(theme.warn(msg)),
  };
  const pluginSelection = resolvePluginUpdateSelection({
    installs: cfg.plugins?.installs ?? {},
    rawId: params.id,
    all: params.opts.all,
  });
  const hookSelection = resolveHookPackUpdateSelection({
    installs: cfg.hooks?.internal?.installs ?? {},
    rawId: params.id,
    all: params.opts.all,
  });
  const explicitHookId = params.id?.trim();
  const hasTrackedPluginInstall =
    explicitHookId !== undefined &&
    Object.prototype.hasOwnProperty.call(cfg.plugins?.installs ?? {}, explicitHookId);
  const fallbackHookIds =
    hookSelection.hookIds.length === 0 && explicitHookId && !hasTrackedPluginInstall
      ? [explicitHookId]
      : [];
  const resolvedHookSelection =
    fallbackHookIds.length > 0 ? { ...hookSelection, hookIds: fallbackHookIds } : hookSelection;

  if (pluginSelection.pluginIds.length === 0 && resolvedHookSelection.hookIds.length === 0) {
    if (params.opts.all) {
      runtime.log("No tracked plugins or hook packs to update.");
      return;
    }
    runtime.error("Provide a plugin or hook-pack id, or use --all.");
    return runtime.exit(1);
  }

  const pluginResult = await pluginUpdateDeps.updateNpmInstalledPlugins({
    config: cfg,
    pluginIds: pluginSelection.pluginIds,
    specOverrides: pluginSelection.specOverrides,
    dryRun: params.opts.dryRun,
    logger,
    onIntegrityDrift: async (drift) => {
      const specLabel = drift.resolvedSpec ?? drift.spec;
      runtime.log(
        theme.warn(
          `Integrity drift detected for "${drift.pluginId}" (${specLabel})` +
            `\nExpected: ${drift.expectedIntegrity}` +
            `\nActual:   ${drift.actualIntegrity}`,
        ),
      );
      if (drift.dryRun) {
        return true;
      }
      return await promptYesNo(`Continue updating "${drift.pluginId}" with this artifact?`);
    },
  });
  const hookResult = await pluginUpdateDeps.updateNpmInstalledHookPacks({
    config: pluginResult.config,
    hookIds: resolvedHookSelection.hookIds,
    specOverrides: resolvedHookSelection.specOverrides,
    dryRun: params.opts.dryRun,
    logger,
    onIntegrityDrift: async (drift) => {
      const specLabel = drift.resolvedSpec ?? drift.spec;
      runtime.log(
        theme.warn(
          `Integrity drift detected for hook pack "${drift.hookId}" (${specLabel})` +
            `\nExpected: ${drift.expectedIntegrity}` +
            `\nActual:   ${drift.actualIntegrity}`,
        ),
      );
      if (drift.dryRun) {
        return true;
      }
      return await promptYesNo(`Continue updating hook pack "${drift.hookId}" with this artifact?`);
    },
  });

  for (const outcome of pluginResult.outcomes) {
    if (outcome.status === "error") {
      runtime.log(theme.error(outcome.message));
      continue;
    }
    if (outcome.status === "skipped") {
      runtime.log(theme.warn(outcome.message));
      continue;
    }
    runtime.log(outcome.message);
  }

  for (const outcome of hookResult.outcomes) {
    if (outcome.status === "error") {
      runtime.log(theme.error(outcome.message));
      continue;
    }
    if (outcome.status === "skipped") {
      runtime.log(theme.warn(outcome.message));
      continue;
    }
    runtime.log(outcome.message);
  }

  if (!params.opts.dryRun && (pluginResult.changed || hookResult.changed)) {
    await pluginUpdateDeps.replaceConfigFile({
      nextConfig: hookResult.config,
      baseHash: (await sourceSnapshotPromise)?.hash,
    });
    runtime.log("Restart the gateway to load plugins and hooks.");
  }
}

export const __testing = {
  setDepsForTest(overrides: Partial<PluginUpdateDeps>): void {
    pluginUpdateDeps = { ...defaultPluginUpdateDeps, ...overrides };
  },
  resetDepsForTest(): void {
    pluginUpdateDeps = defaultPluginUpdateDeps;
  },
};
