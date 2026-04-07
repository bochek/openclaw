import { defineConfig } from "vitest/config";
import { loadPatternListFromEnv, narrowIncludePatternsForCli } from "./vitest.pattern-file.ts";
import { pureTestFiles } from "./vitest.pure-paths.mjs";
import { sharedVitestConfig } from "./vitest.shared.config.ts";

export function createPureVitestConfig(
  env: Record<string, string | undefined> = process.env,
  options: { argv?: string[] } = {},
) {
  const sharedTest = sharedVitestConfig.test ?? {};
  const includeFromEnv = loadPatternListFromEnv("OPENCLAW_VITEST_INCLUDE_FILE", env);
  const cliInclude = narrowIncludePatternsForCli(pureTestFiles, options.argv);

  return defineConfig({
    ...sharedVitestConfig,
    test: {
      ...sharedTest,
      name: "pure",
      isolate: false,
      runner: undefined,
      setupFiles: [],
      include: includeFromEnv ?? cliInclude ?? pureTestFiles,
      exclude: sharedTest.exclude ?? [],
      passWithNoTests: true,
    },
  });
}

export default createPureVitestConfig();
