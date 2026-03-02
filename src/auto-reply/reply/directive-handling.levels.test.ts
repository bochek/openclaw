import { describe, expect, it, vi } from "vitest";
import { resolveCurrentDirectiveLevels } from "./directive-handling.levels.js";

describe("resolveCurrentDirectiveLevels", () => {
  it.each([
    {
      name: "uses session override first",
      sessionEntry: { thinkingLevel: "minimal" },
      agentCfg: { thinkingDefault: "low" },
      modelDefault: "high",
      expectedLevel: "minimal",
      expectedModelCalls: 0,
    },
    {
      name: "uses model default when no session override",
      sessionEntry: {},
      agentCfg: { thinkingDefault: "low" },
      modelDefault: "high",
      expectedLevel: "high",
      expectedModelCalls: 1,
    },
    {
      name: "falls back to global default when model default missing",
      sessionEntry: {},
      agentCfg: { thinkingDefault: "low" },
      modelDefault: undefined,
      expectedLevel: "low",
      expectedModelCalls: 1,
    },
    {
      name: "falls back to off when no defaults are set",
      sessionEntry: {},
      agentCfg: {},
      modelDefault: undefined,
      expectedLevel: "off",
      expectedModelCalls: 1,
    },
  ])("$name", async (testCase) => {
    const resolveDefaultThinkingLevel = vi.fn().mockResolvedValue(testCase.modelDefault);

    const result = await resolveCurrentDirectiveLevels({
      sessionEntry: testCase.sessionEntry,
      agentCfg: testCase.agentCfg,
      resolveDefaultThinkingLevel,
    });

    expect(result.currentThinkLevel).toBe(testCase.expectedLevel);
    expect(resolveDefaultThinkingLevel).toHaveBeenCalledTimes(testCase.expectedModelCalls);
  });
});
