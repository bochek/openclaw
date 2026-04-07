import fs from "node:fs";
import path from "node:path";
import { loadPluginLocalModule } from "../../plugins/local-module-loader.js";
export {
  isJavaScriptModulePath,
  resolveExistingPluginModulePath,
  resolvePluginModuleCandidates,
} from "../../plugins/local-module-loader.js";

export function resolveCompiledBundledModulePath(modulePath: string): string {
  const distRuntimeSegment = `${path.sep}dist-runtime${path.sep}`;
  const compiledDistModulePath = modulePath.replace(
    distRuntimeSegment,
    `${path.sep}dist${path.sep}`,
  );
  return compiledDistModulePath !== modulePath && fs.existsSync(compiledDistModulePath)
    ? compiledDistModulePath
    : modulePath;
}

export function loadChannelPluginModule(params: {
  modulePath: string;
  rootDir: string;
  boundaryRootDir?: string;
  boundaryLabel?: string;
  shouldTryNativeRequire?: (safePath: string) => boolean;
}): unknown {
  return loadPluginLocalModule(params);
}
