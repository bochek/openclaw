import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createPromptCacheVitestConfig(
  env: Record<string, string | undefined> = process.env,
) {
  return createScopedVitestConfig(
    ["src/agents/pi-embedded-runner/tool-result-truncation.test.ts"],
    {
      env,
      passWithNoTests: false,
    },
  );
}

export default createPromptCacheVitestConfig();
