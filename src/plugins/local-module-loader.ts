import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createJiti } from "jiti";
import { openBoundaryFileSync } from "../infra/boundary-file-read.js";
import {
  buildPluginLoaderAliasMap,
  buildPluginLoaderJitiOptions,
  shouldPreferNativeJiti,
} from "./sdk-alias.js";

const nodeRequire = createRequire(import.meta.url);
const jitiLoaders = new Map<string, ReturnType<typeof createJiti>>();

type LocalModuleExecutionMode = "auto" | "transpiled";

function createModuleLoader() {
  return (modulePath: string, executionMode: LocalModuleExecutionMode) => {
    const tryNative =
      executionMode === "transpiled"
        ? false
        : shouldPreferNativeJiti(modulePath) || modulePath.includes(`${path.sep}dist${path.sep}`);
    const aliasMap = buildPluginLoaderAliasMap(modulePath, process.argv[1], import.meta.url);
    const cacheKey = JSON.stringify({
      tryNative,
      aliasMap: Object.entries(aliasMap).toSorted(([left], [right]) => left.localeCompare(right)),
    });
    const cached = jitiLoaders.get(cacheKey);
    if (cached) {
      return cached;
    }
    const loader = createJiti(import.meta.url, {
      ...buildPluginLoaderJitiOptions(aliasMap),
      tryNative,
    });
    jitiLoaders.set(cacheKey, loader);
    return loader;
  };
}

const loadModule = createModuleLoader();

function resolveJsSpecifierCandidates(resolvedPath: string): string[] {
  return [
    resolvedPath,
    `${resolvedPath.slice(0, -3)}.ts`,
    `${resolvedPath.slice(0, -3)}.mts`,
    `${resolvedPath.slice(0, -3)}.cts`,
  ];
}

function resolveMjsSpecifierCandidates(resolvedPath: string): string[] {
  return [resolvedPath, `${resolvedPath.slice(0, -4)}.mts`];
}

function resolveCjsSpecifierCandidates(resolvedPath: string): string[] {
  return [resolvedPath, `${resolvedPath.slice(0, -4)}.cts`];
}

export function findNearestPackageRoot(startDir: string, maxDepth = 12): string | null {
  let cursor = path.resolve(startDir);
  for (let i = 0; i < maxDepth; i += 1) {
    if (fs.existsSync(path.join(cursor, "package.json"))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }
  return null;
}

export function isJavaScriptModulePath(modulePath: string): boolean {
  return [".js", ".mjs", ".cjs"].includes(path.extname(modulePath).toLowerCase());
}

export function resolvePluginModuleCandidates(rootDir: string, specifier: string): string[] {
  const normalizedSpecifier = specifier.replace(/\\/g, "/");
  const resolvedPath = path.resolve(rootDir, normalizedSpecifier);
  const ext = path.extname(resolvedPath).toLowerCase();
  if (!ext) {
    return [
      resolvedPath,
      `${resolvedPath}.ts`,
      `${resolvedPath}.js`,
      `${resolvedPath}.mts`,
      `${resolvedPath}.mjs`,
      `${resolvedPath}.cts`,
      `${resolvedPath}.cjs`,
    ];
  }
  if (ext === ".js") {
    return resolveJsSpecifierCandidates(resolvedPath);
  }
  if (ext === ".mjs") {
    return resolveMjsSpecifierCandidates(resolvedPath);
  }
  if (ext === ".cjs") {
    return resolveCjsSpecifierCandidates(resolvedPath);
  }
  return [resolvedPath];
}

export function resolveExistingPluginModulePath(rootDir: string, specifier: string): string {
  for (const candidate of resolvePluginModuleCandidates(rootDir, specifier)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(rootDir, specifier);
}

export function loadPluginLocalModule(params: {
  modulePath: string;
  rootDir: string;
  boundaryRootDir?: string;
  boundaryLabel?: string;
  executionMode?: LocalModuleExecutionMode;
  shouldTryNativeRequire?: (safePath: string) => boolean;
}): unknown {
  const opened = openBoundaryFileSync({
    absolutePath: params.modulePath,
    rootPath: params.boundaryRootDir ?? params.rootDir,
    boundaryLabel: params.boundaryLabel ?? "plugin root",
    rejectHardlinks: false,
    skipLexicalRootCheck: true,
  });
  if (!opened.ok) {
    throw new Error(
      `${params.boundaryLabel ?? "plugin"} module path escapes plugin root or fails alias checks`,
    );
  }
  const safePath = opened.path;
  fs.closeSync(opened.fd);
  const executionMode = params.executionMode ?? "auto";
  if (
    executionMode !== "transpiled" &&
    process.platform === "win32" &&
    params.shouldTryNativeRequire?.(safePath)
  ) {
    try {
      return nodeRequire(safePath);
    } catch {
      // Fall back to the Jiti loader path when require() cannot handle the entry.
    }
  }
  return loadModule(safePath, executionMode)(safePath);
}
