import { describe, expect, it } from "vitest";
import { validateConfigObjectRaw } from "./validation.js";

describe("config validation allowed-values metadata", () => {
  it("adds allowed values for invalid union paths", () => {
    const result = validateConfigObjectRaw({
      update: { channel: "nightly" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((entry) => entry.path === "update.channel");
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('(allowed: "stable", "beta", "dev")');
      expect(issue?.allowedValues).toEqual(["stable", "beta", "dev"]);
      expect(issue?.allowedValuesHiddenCount).toBe(0);
    }
  });

  it("keeps native enum messages while attaching allowed values metadata", () => {
    const result = validateConfigObjectRaw({
      channels: { signal: { dmPolicy: "maybe" } },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((entry) => entry.path === "channels.signal.dmPolicy");
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("expected one of");
      expect(issue?.message).not.toContain("(allowed:");
      expect(issue?.allowedValues).toEqual(["pairing", "allowlist", "open", "disabled"]);
      expect(issue?.allowedValuesHiddenCount).toBe(0);
    }
  });
});
