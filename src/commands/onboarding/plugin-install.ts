import fs from "node:fs";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { resolveBundledInstallPlanForCatalogEntry } from "../../cli/plugin-install-plan.js";
import type { OpenClawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  findBundledPluginSourceInMap,
  resolveBundledPluginSources,
} from "../../plugins/bundled-sources.js";
import { clearPluginDiscoveryCache } from "../../plugins/discovery.js";
import { enablePluginInConfig } from "../../plugins/enable.js";
import { installPluginFromNpmSpec } from "../../plugins/install.js";
import { buildNpmResolutionInstallFields, recordPluginInstall } from "../../plugins/installs.js";
import { loadOpenClawPlugins } from "../../plugins/loader.js";
import { createPluginLoaderLogger } from "../../plugins/logger.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { WizardPrompter } from "../../wizard/prompts.js";

export type InstallablePluginCatalogEntry = {
  id: string;
  meta: {
    label: string;
  };
  install: {
    npmSpec: string;
    localPath?: string;
    defaultChoice?: "npm" | "local";
  };
};

type InstallResult = {
  cfg: OpenClawConfig;
  installed: boolean;
};

function hasGitWorkspace(workspaceDir?: string): boolean {
  const candidates = new Set<string>();
  candidates.add(path.join(process.cwd(), ".git"));
  if (workspaceDir && workspaceDir !== process.cwd()) {
    candidates.add(path.join(workspaceDir, ".git"));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return true;
    }
  }
  return false;
}

function resolveLocalPath(
  entry: InstallablePluginCatalogEntry,
  workspaceDir: string | undefined,
  allowLocal: boolean,
): string | null {
  if (!allowLocal) {
    return null;
  }
  const raw = entry.install.localPath?.trim();
  if (!raw) {
    return null;
  }
  const candidates = new Set<string>();
  candidates.add(path.resolve(process.cwd(), raw));
  if (workspaceDir && workspaceDir !== process.cwd()) {
    candidates.add(path.resolve(workspaceDir, raw));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveExistingPath(
  rawValue: string,
  workspaceDir: string | undefined,
  allowLocal: boolean,
): string | null {
  if (!allowLocal) {
    return null;
  }
  const raw = rawValue.trim();
  if (!raw) {
    return null;
  }
  const candidates = new Set<string>();
  candidates.add(path.resolve(process.cwd(), raw));
  if (workspaceDir && workspaceDir !== process.cwd()) {
    candidates.add(path.resolve(workspaceDir, raw));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function addPluginLoadPath(cfg: OpenClawConfig, pluginPath: string): OpenClawConfig {
  const existing = cfg.plugins?.load?.paths ?? [];
  const merged = Array.from(new Set([...existing, pluginPath]));
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      load: {
        ...cfg.plugins?.load,
        paths: merged,
      },
    },
  };
}

async function promptInstallChoice(params: {
  entry: InstallablePluginCatalogEntry;
  prompter: WizardPrompter;
  workspaceDir?: string;
  allowLocal: boolean;
}): Promise<string | null> {
  const { entry, prompter, workspaceDir, allowLocal } = params;
  const genericPlaceholder = "@scope/plugin-name or extensions/plugin-name (leave blank to skip)";

  while (true) {
    const source = (
      await prompter.text({
        message: "Plugin package or local path",
        placeholder: genericPlaceholder,
      })
    ).trim();

    if (!source) {
      return null;
    }

    const existingPath = resolveExistingPath(source, workspaceDir, allowLocal);
    if (existingPath) {
      return existingPath;
    }

    const looksLikePath = isLikelyLocalPath(source);
    if (looksLikePath) {
      await prompter.note(`Path not found: ${source}`, "Plugin install");
      continue;
    }

    if (!matchesCatalogNpmSpec(source, entry.install.npmSpec)) {
      await prompter.note(
        `This flow installs ${entry.install.npmSpec}. Enter that package or a local plugin path.`,
        "Plugin install",
      );
      continue;
    }

    return source;
  }
}

function isLikelyLocalPath(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("~")) {
    return true;
  }
  if (trimmed.includes("\\")) {
    return true;
  }
  if (trimmed.startsWith("@")) {
    return false;
  }
  return trimmed.includes("/");
}

function parseNpmPackageName(spec: string): string {
  const trimmed = spec.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("@")) {
    const slashIndex = trimmed.indexOf("/");
    if (slashIndex === -1) {
      return trimmed;
    }
    const versionIndex = trimmed.indexOf("@", slashIndex + 1);
    return versionIndex === -1 ? trimmed : trimmed.slice(0, versionIndex);
  }
  const versionIndex = trimmed.indexOf("@");
  return versionIndex === -1 ? trimmed : trimmed.slice(0, versionIndex);
}

function matchesCatalogNpmSpec(input: string, expectedSpec: string): boolean {
  return parseNpmPackageName(input) === parseNpmPackageName(expectedSpec);
}

export async function ensureOnboardingPluginInstalled(params: {
  cfg: OpenClawConfig;
  entry: InstallablePluginCatalogEntry;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  workspaceDir?: string;
}): Promise<InstallResult> {
  const { entry, prompter, runtime, workspaceDir } = params;
  let next = params.cfg;
  const allowLocal = hasGitWorkspace(workspaceDir);
  const bundledSources = resolveBundledPluginSources({ workspaceDir });
  const bundledLocalPath =
    resolveBundledInstallPlanForCatalogEntry({
      pluginId: entry.id,
      npmSpec: entry.install.npmSpec,
      findBundledSource: (lookup) =>
        findBundledPluginSourceInMap({ bundled: bundledSources, lookup }),
    })?.bundledSource.localPath ?? null;
  const localPath = bundledLocalPath ?? resolveLocalPath(entry, workspaceDir, allowLocal);
  const source = await promptInstallChoice({
    entry,
    prompter,
    workspaceDir,
    allowLocal,
  });

  if (!source) {
    return { cfg: next, installed: false };
  }

  if (isLikelyLocalPath(source)) {
    await prompter.note(
      [`Using existing local plugin at ${source}.`, "No download needed."].join("\n"),
      "Plugin install",
    );
    next = addPluginLoadPath(next, source);
    next = enablePluginInConfig(next, entry.id).config;
    return { cfg: next, installed: true };
  }

  const result = await installPluginFromNpmSpec({
    spec: source,
    logger: {
      info: (msg) => runtime.log?.(msg),
      warn: (msg) => runtime.log?.(msg),
    },
  });

  if (result.ok) {
    next = enablePluginInConfig(next, result.pluginId).config;
    next = recordPluginInstall(next, {
      pluginId: result.pluginId,
      source: "npm",
      spec: source,
      installPath: result.targetDir,
      version: result.version,
      ...buildNpmResolutionInstallFields(result.npmResolution),
    });
    return { cfg: next, installed: true };
  }

  await prompter.note(`Failed to install ${source}: ${result.error}`, "Plugin install");

  if (localPath) {
    const fallback = await prompter.confirm({
      message: `Use local plugin path instead? (${localPath})`,
      initialValue: true,
    });
    if (fallback) {
      await prompter.note(
        [`Using existing local plugin at ${localPath}.`, "No download needed."].join("\n"),
        "Plugin install",
      );
      next = addPluginLoadPath(next, localPath);
      next = enablePluginInConfig(next, entry.id).config;
      return { cfg: next, installed: true };
    }
  }

  runtime.error?.(`Plugin install failed: ${result.error}`);
  return { cfg: next, installed: false };
}

export function reloadOnboardingPluginRegistry(params: {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  workspaceDir?: string;
  suppressOpenAllowlistWarning?: boolean;
}): void {
  clearPluginDiscoveryCache();
  const workspaceDir =
    params.workspaceDir ?? resolveAgentWorkspaceDir(params.cfg, resolveDefaultAgentId(params.cfg));
  const log = createSubsystemLogger("plugins");
  loadOpenClawPlugins({
    config: params.cfg,
    workspaceDir,
    cache: false,
    logger: createPluginLoaderLogger(log),
    suppressOpenAllowlistWarning: params.suppressOpenAllowlistWarning,
  });
}
