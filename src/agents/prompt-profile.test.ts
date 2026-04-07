import { describe, expect, it } from "vitest";
import { resolvePromptProfileForModel } from "./prompt-profile.js";

describe("resolvePromptProfileForModel", () => {
  it("keeps the default frontier path unchanged", () => {
    expect(
      resolvePromptProfileForModel({
        provider: "openai",
        modelId: "gpt-5.4",
      }),
    ).toBe("default");
  });

  it("documents that smaller-model routing is wired but not enabled yet", () => {
    expect(
      resolvePromptProfileForModel({
        provider: "ollama",
        modelId: "qwen2.5-coder:14b",
      }),
    ).toBe("default");
  });
});
