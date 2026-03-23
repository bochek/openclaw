import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { writeJsonAtomic } from "../infra/json-files.js";
import type { PluginCandidate } from "../plugins/discovery.js";
import { isValidLocaleId } from "../plugins/manifest.js";
import { isPathInside, safeRealpathSync } from "../plugins/path-safety.js";
import { listSelectedLocaleResources, loadLocaleRegistry } from "./registry.js";

export type DocsNavLanguage = {
  language: string;
  tabs: unknown[];
};

export type SyncedLocaleDocs = {
  pluginId: string;
  locale: string;
  language: string;
  targetDir: string;
  pageCount: number;
};

export type SyncDocsLocalesResult = {
  docsDir: string;
  sourceConfigPath: string;
  workspaceDir: string;
  outputConfigPath: string;
  syncedLocales: SyncedLocaleDocs[];
};

export type SyncDocsLocalesOptions = {
  docsDir?: string;
  sourceConfigPath?: string;
  workspaceDir?: string;
  outputConfigPath?: string;
  locales?: string[];
  config?: OpenClawConfig;
  workspaceDirForPlugins?: string;
  env?: NodeJS.ProcessEnv;
  candidates?: PluginCandidate[];
};

type DocsConfig = {
  navigation?: {
    languages?: unknown[];
  };
  [key: string]: unknown;
};

const GENERATED_DIRNAME = ".generated";
const DEFAULT_WORKSPACE_DIRNAME = path.join(GENERATED_DIRNAME, "locale-workspace");

function normalizeLocaleFilter(locales: string[] | undefined): Set<string> | null {
  const values = (locales ?? [])
    .map((locale) => locale.trim())
    .filter((locale) => locale && isValidLocaleId(locale));
  return values.length > 0 ? new Set(values) : null;
}

function resolveDocsDir(input: string | undefined): string {
  return path.resolve(input?.trim() || path.join(process.cwd(), "docs"));
}

function resolveSourceConfigPath(docsDir: string, explicitPath: string | undefined): string {
  if (explicitPath?.trim()) {
    return path.resolve(explicitPath);
  }
  const sourceCandidate = path.join(docsDir, "docs.source.json");
  if (fs.existsSync(sourceCandidate)) {
    return sourceCandidate;
  }
  return path.join(docsDir, "docs.json");
}

function resolveWorkspaceDir(docsDir: string, explicitPath: string | undefined): string {
  return explicitPath?.trim()
    ? path.resolve(explicitPath)
    : path.join(docsDir, DEFAULT_WORKSPACE_DIRNAME);
}

function resolveOutputConfigPath(workspaceDir: string, explicitPath: string | undefined): string {
  return explicitPath?.trim() ? path.resolve(explicitPath) : path.join(workspaceDir, "docs.json");
}

function readJsonFileOrThrow<T>(filePath: string, label: string): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    throw new Error(`failed to read ${label}: ${filePath} (${String(error)})`, { cause: error });
  }
}

function normalizeGeneratedSourceConfig(config: DocsConfig): DocsConfig {
  const next = cloneDocsConfig(config);
  const languages = Array.isArray(next.navigation?.languages) ? next.navigation.languages : [];
  next.navigation = {
    ...next.navigation,
    languages: languages.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return false;
      }
      return (entry as Record<string, unknown>).language === "en";
    }),
  };
  return next;
}

function resolveSafePathInsideRoot(params: {
  pluginId: string;
  rootDir: string;
  relativePath: string | undefined;
  label: string;
  mustBeDirectory?: boolean;
}): string {
  const relativePath = params.relativePath?.trim();
  if (!relativePath) {
    throw new Error(`locale plugin "${params.pluginId}" is missing ${params.label}`);
  }
  const resolved = path.resolve(params.rootDir, relativePath);
  if (!isPathInside(params.rootDir, resolved)) {
    throw new Error(
      `locale plugin "${params.pluginId}" ${params.label} escapes plugin root: ${relativePath}`,
    );
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`locale plugin "${params.pluginId}" ${params.label} not found: ${resolved}`);
  }

  const rootRealpath = safeRealpathSync(params.rootDir);
  const targetRealpath = safeRealpathSync(resolved);
  if (!rootRealpath || !targetRealpath || !isPathInside(rootRealpath, targetRealpath)) {
    throw new Error(
      `locale plugin "${params.pluginId}" ${params.label} resolves outside plugin root: ${relativePath}`,
    );
  }

  const stat = fs.statSync(targetRealpath);
  if (params.mustBeDirectory && !stat.isDirectory()) {
    throw new Error(`locale plugin "${params.pluginId}" ${params.label} must be a directory`);
  }
  if (!params.mustBeDirectory && !stat.isFile()) {
    throw new Error(`locale plugin "${params.pluginId}" ${params.label} must be a file`);
  }
  return targetRealpath;
}

function assertDirectoryTreeSafe(params: {
  pluginId: string;
  rootDir: string;
  dirPath: string;
}): void {
  const queue = [params.dirPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) {
        throw new Error(
          `locale plugin "${params.pluginId}" docs resources must not contain symlinks: ${fullPath}`,
        );
      }
      const realpath = safeRealpathSync(fullPath);
      const rootRealpath = safeRealpathSync(params.rootDir);
      if (!realpath || !rootRealpath || !isPathInside(rootRealpath, realpath)) {
        throw new Error(
          `locale plugin "${params.pluginId}" docs resource resolves outside plugin root: ${fullPath}`,
        );
      }
      if (entry.isDirectory()) {
        queue.push(fullPath);
      }
    }
  }
}

function validateDocsNav(
  pluginId: string,
  locale: string,
  docsRoot: string,
  value: unknown,
): DocsNavLanguage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`locale plugin "${pluginId}" docs nav is not an object`);
  }
  const record = value as Record<string, unknown>;
  const language = typeof record.language === "string" ? record.language.trim() : "";
  if (!language) {
    throw new Error(`locale plugin "${pluginId}" docs nav is missing language`);
  }
  if (!Array.isArray(record.tabs)) {
    throw new Error(`locale plugin "${pluginId}" docs nav is missing tabs`);
  }

  const pageEntries = collectNavPages(record.tabs);
  if (pageEntries.length === 0) {
    throw new Error(`locale plugin "${pluginId}" docs nav does not reference any pages`);
  }
  for (const page of pageEntries) {
    if (!page.startsWith(`${locale}/`)) {
      throw new Error(
        `locale plugin "${pluginId}" docs nav page must stay in locale namespace: ${page}`,
      );
    }
    if (!hasDocsPage(docsRoot, page.slice(locale.length + 1))) {
      throw new Error(`locale plugin "${pluginId}" docs nav page not found: ${page}`);
    }
  }
  return {
    language,
    tabs: record.tabs,
  };
}

function collectNavPages(node: unknown): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry) => collectNavPages(entry));
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  const record = node as Record<string, unknown>;
  const entries: string[] = [];
  if (Array.isArray(record.pages)) {
    for (const page of record.pages) {
      if (typeof page === "string") {
        entries.push(page);
      } else {
        entries.push(...collectNavPages(page));
      }
    }
  }
  for (const value of Object.values(record)) {
    if (value !== record.pages) {
      entries.push(...collectNavPages(value));
    }
  }
  return entries;
}

function hasDocsPage(docsRoot: string, relativePage: string): boolean {
  const normalized = relativePage.replace(/^\/+|\/+$/g, "");
  const candidates = [
    normalized,
    `${normalized}.md`,
    `${normalized}.mdx`,
    path.join(normalized, "index.md"),
    path.join(normalized, "index.mdx"),
  ];
  return candidates.some((candidate) => fs.existsSync(path.join(docsRoot, candidate)));
}

function countMarkdownFiles(dir: string): number {
  let count = 0;
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
        count += 1;
      }
    }
  }
  return count;
}

function cloneDocsConfig(config: DocsConfig): DocsConfig {
  return JSON.parse(JSON.stringify(config)) as DocsConfig;
}

function mergeLanguageIntoConfig(config: DocsConfig, languageNav: DocsNavLanguage): DocsConfig {
  const next = cloneDocsConfig(config);
  const existing = Array.isArray(next.navigation?.languages) ? next.navigation.languages : [];
  const filtered = existing.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return true;
    }
    return (entry as Record<string, unknown>).language !== languageNav.language;
  });
  next.navigation = {
    ...next.navigation,
    languages: [...filtered, languageNav],
  };
  return next;
}

function getSourceOwnedLocaleDirs(config: DocsConfig): Set<string> {
  const dirs = new Set<string>();
  const languages = Array.isArray(config.navigation?.languages) ? config.navigation.languages : [];
  for (const page of collectNavPages(languages)) {
    const [topLevel] = page.split("/");
    if (topLevel && isValidLocaleId(topLevel) && topLevel !== "en") {
      dirs.add(topLevel);
    }
  }
  return dirs;
}

function copyCanonicalDocsWorkspace(params: {
  docsDir: string;
  workspaceDir: string;
  sourceOwnedLocaleDirs: Set<string>;
}): void {
  fs.mkdirSync(params.workspaceDir, { recursive: true });
  for (const entry of fs.readdirSync(params.docsDir, { withFileTypes: true })) {
    if (
      entry.name === GENERATED_DIRNAME ||
      entry.name === "docs.json" ||
      entry.name === "docs.source.json"
    ) {
      continue;
    }
    if (entry.isDirectory() && params.sourceOwnedLocaleDirs.has(entry.name)) {
      continue;
    }
    const sourcePath = path.join(params.docsDir, entry.name);
    const targetPath = path.join(params.workspaceDir, entry.name);
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  }
}

export async function syncDocsLocales(
  options: SyncDocsLocalesOptions = {},
): Promise<SyncDocsLocalesResult> {
  const docsDir = resolveDocsDir(options.docsDir);
  const sourceConfigPath = resolveSourceConfigPath(docsDir, options.sourceConfigPath);
  const workspaceDir = resolveWorkspaceDir(docsDir, options.workspaceDir);
  const outputConfigPath = resolveOutputConfigPath(workspaceDir, options.outputConfigPath);
  const rawBaseConfig = readJsonFileOrThrow<DocsConfig>(sourceConfigPath, "docs config");
  const baseConfig = normalizeGeneratedSourceConfig(rawBaseConfig);
  const sourceOwnedLocaleDirs = getSourceOwnedLocaleDirs(rawBaseConfig);
  const localeFilter = normalizeLocaleFilter(options.locales);
  const registry = loadLocaleRegistry({
    config: options.config,
    workspaceDir: options.workspaceDirForPlugins,
    env: options.env,
    candidates: options.candidates,
  });

  fs.rmSync(workspaceDir, { recursive: true, force: true });
  copyCanonicalDocsWorkspace({ docsDir, workspaceDir, sourceOwnedLocaleDirs });

  let nextConfig = baseConfig;
  const syncedLocales: SyncedLocaleDocs[] = [];

  for (const selection of listSelectedLocaleResources(registry, "docs")) {
    const { selected } = selection;
    if (!isValidLocaleId(selected.locale)) {
      throw new Error(
        `locale plugin "${selected.pluginId}" has invalid locale id: ${selected.locale}`,
      );
    }
    if (localeFilter && !localeFilter.has(selected.locale)) {
      continue;
    }

    const docsRoot = resolveSafePathInsideRoot({
      pluginId: selected.pluginId,
      rootDir: selected.rootDir,
      relativePath: selected.relativePath,
      label: "localization.docs.root",
      mustBeDirectory: true,
    });
    assertDirectoryTreeSafe({
      pluginId: selected.pluginId,
      rootDir: selected.rootDir,
      dirPath: docsRoot,
    });
    const selectedPackage = registry.packages.find(
      (entry) =>
        entry.pluginId === selected.pluginId &&
        entry.rootDir === selected.rootDir &&
        entry.manifestPath === selected.manifestPath &&
        entry.origin === selected.origin,
    );
    const docsNavPath = resolveSafePathInsideRoot({
      pluginId: selected.pluginId,
      rootDir: selected.rootDir,
      relativePath: selectedPackage?.localization.docs?.navPath,
      label: "localization.docs.navPath",
    });
    const docsNav = validateDocsNav(
      selected.pluginId,
      selected.locale,
      docsRoot,
      readJsonFileOrThrow(docsNavPath, "locale docs nav"),
    );

    const targetDir = path.join(workspaceDir, selected.locale);
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(docsRoot, targetDir, { recursive: true });

    nextConfig = mergeLanguageIntoConfig(nextConfig, docsNav);
    syncedLocales.push({
      pluginId: selected.pluginId,
      locale: selected.locale,
      language: docsNav.language,
      targetDir,
      pageCount: countMarkdownFiles(targetDir),
    });
  }

  await writeJsonAtomic(outputConfigPath, nextConfig, { trailingNewline: true, mode: 0o644 });

  return {
    docsDir,
    sourceConfigPath,
    workspaceDir,
    outputConfigPath,
    syncedLocales,
  };
}
