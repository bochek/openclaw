import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROFILE_ATTACH_RETRY_TIMEOUT_MS,
  PROFILE_HTTP_REACHABILITY_TIMEOUT_MS,
} from "./cdp-timeouts.js";
import type { ResolvedBrowserProfile } from "./config.js";
import type { RunningChrome } from "./chrome.js";
import {
  __testing as availabilityTesting,
  createProfileAvailability,
} from "./server-context.availability.js";
import type { BrowserServerState, ProfileRuntimeState } from "./server-context.js";

const availabilityMocks = vi.hoisted(() => ({
  closeChromeMcpSession: vi.fn(async () => false),
  ensureChromeMcpAvailable: vi.fn(async () => {}),
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchOpenClawChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  listChromeMcpTabs: vi.fn(async () => []),
  stopOpenClawChrome: vi.fn(async () => {}),
}));

const TEST_CDP_READY_TIMING = {
  cdpReadyAfterLaunchMaxTimeoutMs: 10,
  cdpReadyAfterLaunchMinTimeoutMs: 1,
  cdpReadyAfterLaunchPollMs: 1,
  cdpReadyAfterLaunchWindowMs: 20,
};

function makeBrowserState(): BrowserServerState {
  return {
    // oxlint-disable-next-line typescript/no-explicit-any
    server: null as any,
    port: 0,
    resolved: {
      enabled: true,
      controlPort: 18791,
      cdpProtocol: "http",
      cdpHost: "127.0.0.1",
      cdpIsLoopback: true,
      cdpPortRangeStart: 18800,
      cdpPortRangeEnd: 18810,
      evaluateEnabled: false,
      remoteCdpTimeoutMs: 1500,
      remoteCdpHandshakeTimeoutMs: 3000,
      extraArgs: [],
      color: "#FF4500",
      headless: true,
      noSandbox: false,
      attachOnly: false,
      ssrfPolicy: { allowPrivateNetwork: true },
      defaultProfile: "openclaw",
      profiles: {
        openclaw: { cdpPort: 18800, color: "#FF4500" },
      },
    },
    profiles: new Map(),
  };
}

function mockLaunchedChrome(
  launchOpenClawChrome: { mockResolvedValue: (value: RunningChrome) => unknown },
  pid: number,
) {
  const proc = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  launchOpenClawChrome.mockResolvedValue({
    pid,
    exe: { kind: "chromium", path: "/usr/bin/chromium" },
    userDataDir: "/tmp/openclaw-test",
    cdpPort: 18800,
    startedAt: Date.now(),
    proc,
  });
}

function makeProfile(): ResolvedBrowserProfile {
  return {
    name: "openclaw",
    cdpPort: 18800,
    cdpUrl: "http://127.0.0.1:18800",
    cdpHost: "127.0.0.1",
    cdpIsLoopback: true,
    color: "#FF4500",
    driver: "openclaw",
    attachOnly: false,
  };
}

function setupEnsureBrowserAvailableHarness() {
  const launchOpenClawChrome = availabilityMocks.launchOpenClawChrome;
  const stopOpenClawChrome = availabilityMocks.stopOpenClawChrome;
  const isChromeReachable = availabilityMocks.isChromeReachable;
  const isChromeCdpReady = availabilityMocks.isChromeCdpReady;
  isChromeReachable.mockResolvedValue(false);

  const state = makeBrowserState();
  const profileState: ProfileRuntimeState = {
    profile: makeProfile(),
    running: null,
    lastTargetId: null,
    reconcile: null,
  };
  const profile = createProfileAvailability({
    opts: { getState: () => state },
    profile: profileState.profile,
    state: () => state,
    getProfileState: () => profileState,
    setProfileRunning: (next) => {
      profileState.running = next;
    },
  });

  return { launchOpenClawChrome, stopOpenClawChrome, isChromeCdpReady, profile };
}

beforeEach(() => {
  availabilityTesting.setDepsForTest(availabilityMocks);
  availabilityTesting.setTimingForTest(TEST_CDP_READY_TIMING);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("browser server-context ensureBrowserAvailable", () => {
  it("waits for CDP readiness after launching to avoid follow-up PortInUseError races (#21149)", async () => {
    const { launchOpenClawChrome, stopOpenClawChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValueOnce(false).mockResolvedValue(true);
    mockLaunchedChrome(launchOpenClawChrome, 123);

    await expect(profile.ensureBrowserAvailable()).resolves.toBeUndefined();

    expect(launchOpenClawChrome).toHaveBeenCalledTimes(1);
    expect(isChromeCdpReady).toHaveBeenCalled();
    expect(stopOpenClawChrome).not.toHaveBeenCalled();
  });

  it("stops launched chrome when CDP readiness never arrives", async () => {
    const { launchOpenClawChrome, stopOpenClawChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    isChromeCdpReady.mockResolvedValue(false);
    mockLaunchedChrome(launchOpenClawChrome, 321);

    await expect(profile.ensureBrowserAvailable()).rejects.toThrow("not reachable after start");

    expect(launchOpenClawChrome).toHaveBeenCalledTimes(1);
    expect(stopOpenClawChrome).toHaveBeenCalledTimes(1);
  });

  it("reuses a pre-existing loopback browser after an initial short probe miss", async () => {
    const { launchOpenClawChrome, stopOpenClawChrome, isChromeCdpReady, profile } =
      setupEnsureBrowserAvailableHarness();
    const isChromeReachable = availabilityMocks.isChromeReachable;

    isChromeReachable.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    isChromeCdpReady.mockResolvedValueOnce(true);

    await expect(profile.ensureBrowserAvailable()).resolves.toBeUndefined();

    expect(isChromeReachable).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:18800",
      PROFILE_HTTP_REACHABILITY_TIMEOUT_MS,
      {
        allowPrivateNetwork: true,
      },
    );
    expect(isChromeReachable).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:18800",
      PROFILE_ATTACH_RETRY_TIMEOUT_MS,
      {
        allowPrivateNetwork: true,
      },
    );
    expect(launchOpenClawChrome).not.toHaveBeenCalled();
    expect(stopOpenClawChrome).not.toHaveBeenCalled();
  });
});
