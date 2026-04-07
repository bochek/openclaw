import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findNearestPackageRoot,
  loadPluginLocalModule,
  resolveExistingPluginModulePath,
} from "../plugins/local-module-loader.js";

export {
  createLazyRuntimeModule,
  createLazyRuntimeMethod,
  createLazyRuntimeMethodBinder,
  createLazyRuntimeNamedExport,
  createLazyRuntimeSurface,
} from "../shared/lazy-runtime.js";

export function createLazyPluginLocalModule<TModule>(
  importMetaUrl: string,
  specifier: string,
): () => Promise<TModule> {
  let cached: Promise<TModule> | null = null;

  return () => {
    cached ??= Promise.resolve().then(() => {
      if (process.env.VITEST) {
        return import(new URL(specifier, importMetaUrl).href) as Promise<TModule>;
      }
      const importerPath = fileURLToPath(importMetaUrl);
      const importerDir = path.dirname(importerPath);
      const pluginRoot =
        findNearestPackageRoot(importerDir) ??
        (() => {
          throw new Error(
            `Could not resolve plugin package root for ${importerPath} while loading ${specifier}`,
          );
        })();

      return loadPluginLocalModule({
        modulePath: resolveExistingPluginModulePath(importerDir, specifier),
        rootDir: importerDir,
        boundaryRootDir: pluginRoot,
        boundaryLabel: "plugin package root",
        executionMode: "transpiled",
      }) as TModule;
    });
    return cached;
  };
}
