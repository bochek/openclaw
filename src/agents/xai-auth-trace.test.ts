import { describe, expect, it } from "vitest";
import { shouldLogProviderAuthSummaryOnce, shouldTraceProviderAuth } from "./xai-auth-trace.js";

describe("xai auth trace helpers", () => {
  it("only enables verbose xai auth tracing when the debug env var is set", () => {
    expect(shouldTraceProviderAuth("xai", {} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      shouldTraceProviderAuth("xai", { OPENCLAW_DEBUG_XAI_AUTH: "1" } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      shouldTraceProviderAuth("openai", { OPENCLAW_DEBUG_XAI_AUTH: "1" } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("logs the xai auth summary only once per summary key", () => {
    const key = `unit-${Date.now()}`;
    expect(shouldLogProviderAuthSummaryOnce("xai", key)).toBe(true);
    expect(shouldLogProviderAuthSummaryOnce("xai", key)).toBe(false);
    expect(shouldLogProviderAuthSummaryOnce("openai", `${key}-other`)).toBe(false);
  });
});
