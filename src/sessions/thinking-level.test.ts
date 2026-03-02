import { describe, expect, it, vi } from "vitest";
import type { ThinkLevel } from "../auto-reply/thinking.js";
import { resolveThinkingLevelByPrecedence } from "./thinking-level.js";

function createModelDefaultResolver(value: ThinkLevel | undefined) {
  const fn = vi.fn().mockResolvedValue(value);
  return {
    fn,
    resolve: () => fn() as Promise<ThinkLevel | undefined>,
  };
}

describe("resolveThinkingLevelByPrecedence", () => {
  it.each([
    {
      name: "command override wins",
      commandThinkLevel: "high" as ThinkLevel,
      sessionThinkLevel: "medium" as ThinkLevel,
      modelDefault: "low" as ThinkLevel,
      globalDefaultThinkLevel: "minimal" as ThinkLevel,
      expected: { level: "high", source: "command" },
      expectedModelCalls: 0,
    },
    {
      name: "session override wins when command unset",
      commandThinkLevel: null,
      sessionThinkLevel: "medium" as ThinkLevel,
      modelDefault: "low" as ThinkLevel,
      globalDefaultThinkLevel: "minimal" as ThinkLevel,
      expected: { level: "medium", source: "session" },
      expectedModelCalls: 0,
    },
    {
      name: "model default wins when command and session unset",
      commandThinkLevel: undefined,
      sessionThinkLevel: null,
      modelDefault: "low" as ThinkLevel,
      globalDefaultThinkLevel: "minimal" as ThinkLevel,
      expected: { level: "low", source: "model_default" },
      expectedModelCalls: 1,
    },
    {
      name: "global default wins when model default missing",
      commandThinkLevel: undefined,
      sessionThinkLevel: undefined,
      modelDefault: undefined,
      globalDefaultThinkLevel: "minimal" as ThinkLevel,
      expected: { level: "minimal", source: "global_default" },
      expectedModelCalls: 1,
    },
    {
      name: "disabled fallback when everything unset",
      commandThinkLevel: undefined,
      sessionThinkLevel: undefined,
      modelDefault: undefined,
      globalDefaultThinkLevel: null,
      expected: { level: "off", source: "disabled" },
      expectedModelCalls: 1,
    },
  ])("$name", async (testCase) => {
    const modelDefaultResolver = createModelDefaultResolver(testCase.modelDefault);
    const result = await resolveThinkingLevelByPrecedence({
      commandThinkLevel: testCase.commandThinkLevel,
      sessionThinkLevel: testCase.sessionThinkLevel,
      resolveModelDefaultThinkingLevel: modelDefaultResolver.resolve,
      globalDefaultThinkLevel: testCase.globalDefaultThinkLevel,
    });

    expect(result).toEqual(testCase.expected);
    expect(modelDefaultResolver.fn).toHaveBeenCalledTimes(testCase.expectedModelCalls);
  });

  it("supports custom disabled fallback level", async () => {
    const result = await resolveThinkingLevelByPrecedence({
      disabledThinkLevel: "minimal",
    });
    expect(result).toEqual({
      level: "minimal",
      source: "disabled",
    });
  });
});
