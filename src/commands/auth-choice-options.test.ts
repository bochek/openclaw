import { describe, expect, it } from "vitest";
import type { AuthProfileStore } from "../agents/auth-profiles.js";
import { buildAuthChoiceGroups } from "./auth-choice-options.js";

const EMPTY_STORE: AuthProfileStore = { version: 1, profiles: {} };

describe("buildAuthChoiceGroups", () => {
  it("labels MiniMax non-OAuth options as API-Key", () => {
    const { groups } = buildAuthChoiceGroups({
      store: EMPTY_STORE,
      includeSkip: false,
    });
    const minimaxGroup = groups.find((group) => group.value === "minimax");

    expect(minimaxGroup).toBeDefined();
    expect(minimaxGroup?.options.find((opt) => opt.value === "minimax-portal")?.label).toContain(
      "OAuth",
    );
    expect(minimaxGroup?.options.find((opt) => opt.value === "minimax-api")?.label).toContain(
      "API-Key",
    );
    expect(
      minimaxGroup?.options.find((opt) => opt.value === "minimax-api-key-cn")?.label,
    ).toContain("API-Key");
    expect(
      minimaxGroup?.options.find((opt) => opt.value === "minimax-api-lightning")?.label,
    ).toContain("API-Key");
  });
});
