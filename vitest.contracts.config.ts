import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createContractsVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(
    [
      "src/channels/plugins/contracts/**/*.test.ts",
      "src/plugins/contracts/**/*.test.ts",
      "extensions/**/registry-backed.contract.test.ts",
    ],
    {
      env,
      passWithNoTests: true,
    },
  );
}

export default createContractsVitestConfig();
