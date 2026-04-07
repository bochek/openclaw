import { pluginSdkLightTestFiles } from "./vitest.plugin-sdk-paths.mjs";
import { pureTestFiles } from "./vitest.pure-paths.mjs";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createPluginSdkLightVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(pluginSdkLightTestFiles, {
    dir: "src",
    env,
    exclude: pureTestFiles,
    includeOpenClawRuntimeSetup: false,
    name: "plugin-sdk-light",
    passWithNoTests: true,
  });
}

export default createPluginSdkLightVitestConfig();
