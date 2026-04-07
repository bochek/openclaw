import { pureTestFiles } from "./vitest.pure-paths.mjs";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createSharedCoreVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(["src/shared/**/*.test.ts"], {
    dir: "src",
    env,
    exclude: pureTestFiles,
    includeOpenClawRuntimeSetup: false,
    name: "shared-core",
    passWithNoTests: true,
  });
}

export default createSharedCoreVitestConfig();
