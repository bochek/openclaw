const parseTruthyEnv = (value) => {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
};

export function resolveThreadPoolPolicy({
  env = process.env,
  isCI = false,
  isWindows = false,
  hostCpuCount = 0,
  hostMemoryGiB = 0,
  loadRatio = 0,
  testProfile = "normal",
} = {}) {
  const forceThreads = parseTruthyEnv(env.OPENCLAW_TEST_FORCE_THREADS);
  const forceForks =
    parseTruthyEnv(env.OPENCLAW_TEST_FORCE_FORKS) ||
    parseTruthyEnv(env.OPENCLAW_TEST_DISABLE_THREAD_EXPANSION);

  if (isCI) {
    return {
      threadExpansionEnabled: false,
      defaultUnitPool: "threads",
      defaultBasePool: "forks",
      unitFastLaneCount: isWindows ? 1 : 3,
      reason: "ci-preserves-current-policy",
    };
  }

  if (forceForks) {
    return {
      threadExpansionEnabled: false,
      defaultUnitPool: "forks",
      defaultBasePool: "forks",
      unitFastLaneCount: 1,
      reason: "forced-forks",
    };
  }

  if (forceThreads) {
    return {
      threadExpansionEnabled: true,
      defaultUnitPool: "threads",
      defaultBasePool: "threads",
      unitFastLaneCount: hostCpuCount >= 12 && hostMemoryGiB >= 96 && loadRatio < 0.5 ? 2 : 1,
      reason: "forced-threads",
    };
  }

  if (isWindows) {
    return {
      threadExpansionEnabled: false,
      defaultUnitPool: "forks",
      defaultBasePool: "forks",
      unitFastLaneCount: 1,
      reason: "windows-local-conservative",
    };
  }

  if (testProfile === "serial" || testProfile === "low" || testProfile === "macmini") {
    return {
      threadExpansionEnabled: false,
      defaultUnitPool: "forks",
      defaultBasePool: "forks",
      unitFastLaneCount: 1,
      reason: "profile-conservative",
    };
  }

  if (hostMemoryGiB < 64) {
    return {
      threadExpansionEnabled: false,
      defaultUnitPool: "forks",
      defaultBasePool: "forks",
      unitFastLaneCount: 1,
      reason: "memory-below-thread-threshold",
    };
  }

  if (hostCpuCount < 10) {
    return {
      threadExpansionEnabled: false,
      defaultUnitPool: "forks",
      defaultBasePool: "forks",
      unitFastLaneCount: 1,
      reason: "cpu-below-thread-threshold",
    };
  }

  if (loadRatio >= 0.9) {
    return {
      threadExpansionEnabled: false,
      defaultUnitPool: "forks",
      defaultBasePool: "forks",
      unitFastLaneCount: 1,
      reason: "host-under-load",
    };
  }

  return {
    threadExpansionEnabled: true,
    defaultUnitPool: "threads",
    defaultBasePool: "threads",
    unitFastLaneCount: hostCpuCount >= 12 && hostMemoryGiB >= 96 && loadRatio < 0.5 ? 2 : 1,
    reason: "strong-local-host",
  };
}
