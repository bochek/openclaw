import { describe, expect, it } from "vitest";
import { resolveBrowserConfig, resolveProfile } from "../config.js";
import { resolveSnapshotPlan } from "./agent.snapshot.plan.js";

describe("resolveSnapshotPlan", () => {
  it("defaults chrome existing-session snapshots to ai when format is omitted", () => {
    const resolved = resolveBrowserConfig({});
    const profile = resolveProfile(resolved, "chrome");
    expect(profile).toBeTruthy();
    expect(profile?.driver).toBe("existing-session");

    const plan = resolveSnapshotPlan({
      profile: profile as NonNullable<typeof profile>,
      query: {},
      hasPlaywright: true,
    });

    expect(plan.format).toBe("ai");
  });

  it("keeps ai snapshots for managed browsers when Playwright is available", () => {
    const resolved = resolveBrowserConfig({});
    const profile = resolveProfile(resolved, "openclaw");
    expect(profile).toBeTruthy();

    const plan = resolveSnapshotPlan({
      profile: profile as NonNullable<typeof profile>,
      query: {},
      hasPlaywright: true,
    });

    expect(plan.format).toBe("ai");
  });
});
