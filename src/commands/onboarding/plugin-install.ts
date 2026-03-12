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

type InstallChoice = "enter" | "skip";

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
  localPath?: string | null;
  defaultSource: string;
  prompter: WizardPrompter;
  workspaceDir?: string;
  allowLocal: boolean;
}): Promise<string | null> {
  const { entry, localPath, prompter, defaultSource, workspaceDir, allowLocal } = params;
  const action = await prompter.select<InstallChoice>({
    message: `Install ${entry.meta.label} plugin?`,
    options: [
      {
        value: "enter",
        label: "Enter package or local path",
        hint: localPath
          ? `${entry.install.npmSpec} or ${localPath}`
          : `${entry.install.npmSpec} or ./path/to/plugin`,
      },
      { value: "skip", label: "Skip for now" },
    ],
    initialValue: "enter",
  });

  if (action === "skip") {
    return null;
  }

  while (true) {
    const source = (
      await prompter.text({
        message: "Plugin package or local path",
        initialValue: defaultSource,
        placeholder: localPath
          ? `${entry.install.npmSpec} or ${localPath}`
          : `${entry.install.npmSpec} or ./path/to/plugin`,
        validate: (value) =>
          value.trim().length > 0 ? undefined : "Enter a package or local path",
      })
    ).trim();

    const existingPath = resolveExistingPath(source, workspaceDir, allowLocal);
    if (existingPath) {
      return existingPath;
    }

    const looksLikePath =
      source.startsWith(".") ||
      source.startsWith("/") ||
      source.startsWith("~") ||
      source.includes("/") ||
      source.includes("\\");
    if (looksLikePath) {
      await prompter.note(`Path not found: ${source}`, "Plugin install");
      continue;
    }

    return source;
  }
}

function resolveInstallDefaultSource(params: {
  entry: InstallablePluginCatalogEntry;
  defaultChoice: "npm" | "local";
  localPath?: string | null;
}): string {
  const { entry, defaultChoice, localPath } = params;
  if (defaultChoice === "local" && localPath) {
    return localPath;
  }
  return entry.install.npmSpec;
}

function isLikelyLocalPath(source: string): boolean {
  return (
    source.startsWith(".") ||
    source.startsWith("/") ||
    source.startsWith("~") ||
    source.includes("/") ||
    source.includes("\\")
  );
}

function resolveInstallDefaultChoice(params: {
  cfg: OpenClawConfig;
  entry: InstallablePluginCatalogEntry;
  localPath?: string | null;
  bundledLocalPath?: string | null;
}): InstallChoice {
  const { cfg, entry, localPath, bundledLocalPath } = params;
  if (bundledLocalPath) {
    return "local";
  }
  const updateChannel = cfg.update?.channel;
  if (updateChannel === "dev") {
    return localPath ? "local" : "npm";
  }
  if (updateChannel === "stable" || updateChannel === "beta") {
    return "npm";
  }
  const entryDefault = entry.install.defaultChoice;
  if (entryDefault === "local") {
    return localPath ? "local" : "npm";
  }
  if (entryDefault === "npm") {
    return "npm";
  }
  return localPath ? "local" : "npm";
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
  const defaultChoice = resolveInstallDefaultChoice({
    cfg: next,
    entry,
    localPath,
    bundledLocalPath,
  });
  const source = await promptInstallChoice({
    entry,
    localPath,
    defaultSource: resolveInstallDefaultSource({ entry, defaultChoice, localPath }),
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
