import { describe, expect, it } from "vitest";
import { resolveThreadPoolPolicy } from "../../scripts/test-parallel-pool-policy.mjs";

describe("scripts/test-parallel-pool-policy", () => {
  it("keeps constrained local hosts on forks", () => {
    expect(
      resolveThreadPoolPolicy({
        isCI: false,
        isWindows: false,
        hostCpuCount: 8,
        hostMemoryGiB: 32,
        loadRatio: 0.2,
        testProfile: "normal",
      }),
    ).toMatchObject({
      threadExpansionEnabled: false,
      defaultUnitPool: "forks",
      defaultBasePool: "forks",
      unitFastLaneCount: 1,
      reason: "memory-below-thread-threshold",
    });
  });

  it("enables threads for strong idle local hosts", () => {
    expect(
      resolveThreadPoolPolicy({
        isCI: false,
        isWindows: false,
        hostCpuCount: 16,
        hostMemoryGiB: 128,
        loadRatio: 0.2,
        testProfile: "normal",
      }),
    ).toMatchObject({
      threadExpansionEnabled: true,
      defaultUnitPool: "threads",
      defaultBasePool: "threads",
      unitFastLaneCount: 2,
      reason: "strong-local-host",
    });
  });

  it("disables thread expansion for saturated local hosts", () => {
    expect(
      resolveThreadPoolPolicy({
        isCI: false,
        isWindows: false,
        hostCpuCount: 16,
        hostMemoryGiB: 128,
        loadRatio: 1.05,
        testProfile: "normal",
      }),
    ).toMatchObject({
      threadExpansionEnabled: false,
      defaultUnitPool: "forks",
      defaultBasePool: "forks",
      unitFastLaneCount: 1,
      reason: "host-under-load",
    });
  });

  it("honors explicit force-threads overrides", () => {
    expect(
      resolveThreadPoolPolicy({
        env: { OPENCLAW_TEST_FORCE_THREADS: "1" },
        isCI: false,
        isWindows: false,
        hostCpuCount: 8,
        hostMemoryGiB: 32,
        loadRatio: 1.2,
        testProfile: "normal",
      }),
    ).toMatchObject({
      threadExpansionEnabled: true,
      defaultUnitPool: "threads",
      defaultBasePool: "threads",
      reason: "forced-threads",
    });
  });

  it("keeps CI on the current policy", () => {
    expect(
      resolveThreadPoolPolicy({
        isCI: true,
        isWindows: false,
        hostCpuCount: 32,
        hostMemoryGiB: 128,
        loadRatio: 0,
        testProfile: "normal",
      }),
    ).toMatchObject({
      threadExpansionEnabled: false,
      defaultUnitPool: "threads",
      defaultBasePool: "forks",
      unitFastLaneCount: 3,
      reason: "ci-preserves-current-policy",
    });
  });
});
