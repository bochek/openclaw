import { describe, expect, it } from "vitest";
import { mapThinkingLevel, resolveAdaptiveThinkingLevel } from "./utils.js";

describe("resolveAdaptiveThinkingLevel", () => {
  it("passes through fixed thinking levels", () => {
    expect(resolveAdaptiveThinkingLevel({ level: "high", prompt: "fix the gateway" })).toBe("high");
  });

  it("keeps simple chat light", () => {
    expect(resolveAdaptiveThinkingLevel({ level: "adaptive", prompt: "what model are you" })).toBe(
      "low",
    );
  });

  it("uses medium for ordinary tool-capable turns", () => {
    expect(
      resolveAdaptiveThinkingLevel({
        level: "adaptive",
        prompt: "Can you check my notes and summarize what changed today?",
      }),
    ).toBe("medium");
  });

  it("uses high for investigation and debugging", () => {
    expect(
      resolveAdaptiveThinkingLevel({
        level: "adaptive",
        prompt: "Can you check the logs and debug why Telegram is timing out?",
      }),
    ).toBe("high");
  });

  it("uses xhigh for risky production mutations", () => {
    expect(
      resolveAdaptiveThinkingLevel({
        level: "adaptive",
        prompt: "Fix the VPS gateway auth token issue and restart the production service.",
      }),
    ).toBe("xhigh");
  });
});

describe("mapThinkingLevel", () => {
  it("retains the defensive adaptive fallback mapping", () => {
    expect(mapThinkingLevel("adaptive")).toBe("medium");
  });
});
