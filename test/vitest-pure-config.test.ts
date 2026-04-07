import { describe, expect, it } from "vitest";
import { createCommandsLightVitestConfig } from "../vitest.commands-light.config.ts";
import { createPluginSdkLightVitestConfig } from "../vitest.plugin-sdk-light.config.ts";
import {
  classifyPureTestFileContent,
  collectBroadPureTestCandidates,
  collectPureTestCandidates,
  collectPureTestFileAnalysis,
  isPureTestFile,
  pureTestFiles,
  resolvePureTestIncludePattern,
} from "../vitest.pure-paths.mjs";
import { createPureVitestConfig } from "../vitest.pure.config.ts";

describe("pure vitest lane", () => {
  it("runs cache-friendly tests without the reset-heavy runner or runtime setup", () => {
    const config = createPureVitestConfig({});

    expect(config.test?.isolate).toBe(false);
    expect(config.test?.runner).toBeUndefined();
    expect(config.test?.setupFiles).toEqual([]);
    expect(config.test?.include).toContain("src/plugin-sdk/lazy-value.test.ts");
    expect(config.test?.include).toContain("src/commands/cleanup-utils.test.ts");
  });

  it("keeps obvious stateful files out of the pure lane", () => {
    expect(isPureTestFile("src/plugin-sdk/temp-path.test.ts")).toBe(false);
    expect(resolvePureTestIncludePattern("src/plugin-sdk/temp-path.ts")).toBeNull();
    expect(classifyPureTestFileContent("vi.resetModules(); await import('./x.js')")).toEqual([
      "module-mocking",
      "dynamic-import",
    ]);
  });

  it("routes pure source files to their pure sibling tests", () => {
    expect(resolvePureTestIncludePattern("src/plugin-sdk/lazy-value.ts")).toBe(
      "src/plugin-sdk/lazy-value.test.ts",
    );
    expect(resolvePureTestIncludePattern("src/commands/cleanup-utils.ts")).toBe(
      "src/commands/cleanup-utils.test.ts",
    );
  });

  it("keeps broad audit candidates separate from automatically routed pure tests", () => {
    const currentCandidates = collectPureTestCandidates();
    const broadCandidates = collectBroadPureTestCandidates();
    const broadAnalysis = collectPureTestFileAnalysis(process.cwd(), { scope: "broad" });

    expect(currentCandidates.length).toBeGreaterThanOrEqual(pureTestFiles.length);
    expect(broadCandidates.length).toBeGreaterThan(currentCandidates.length);
    expect(broadAnalysis.filter((entry) => entry.pure).length).toBeGreaterThan(
      pureTestFiles.length,
    );
  });

  it("excludes pure files from the older light lanes so full runs do not duplicate them", () => {
    const pluginSdkLight = createPluginSdkLightVitestConfig({});
    const commandsLight = createCommandsLightVitestConfig({});

    expect(pureTestFiles).toContain("src/plugin-sdk/lazy-value.test.ts");
    expect(pluginSdkLight.test?.exclude).toContain("plugin-sdk/lazy-value.test.ts");
    expect(commandsLight.test?.exclude).toContain("cleanup-utils.test.ts");
  });
});
