import { beforeEach, describe, expect, it, vi } from "vitest";

const tailscaleState = vi.hoisted(() => ({
  enableServe: vi.fn(async (_port: number) => {}),
  disableServe: vi.fn(async () => {}),
  enableFunnel: vi.fn(async (_port: number) => {}),
  disableFunnel: vi.fn(async () => {}),
  getHost: vi.fn(async () => "gateway.tailnet.ts.net"),
}));

vi.mock("../infra/tailscale.js", () => ({
  enableTailscaleServe: (port: number) => tailscaleState.enableServe(port),
  disableTailscaleServe: () => tailscaleState.disableServe(),
  enableTailscaleFunnel: (port: number) => tailscaleState.enableFunnel(port),
  disableTailscaleFunnel: () => tailscaleState.disableFunnel(),
  getTailnetHostname: () => tailscaleState.getHost(),
}));

import { startGatewayTailscaleExposure } from "./server-tailscale.js";

function createOwnerStore() {
  let currentOwner: null | {
    token: string;
    mode: "serve" | "funnel";
    port: number;
    pid: number;
    claimedAt: string;
  } = null;
  let nextId = 0;

  return {
    async claim(mode: "serve" | "funnel", port: number) {
      const previousOwner = currentOwner;
      const owner = {
        token: `owner-${++nextId}`,
        mode,
        port,
        pid: nextId,
        claimedAt: new Date(0).toISOString(),
      };
      currentOwner = owner;
      return { owner, previousOwner };
    },
    async replaceIfCurrent(token: string, nextOwner: typeof currentOwner | null) {
      if (currentOwner?.token !== token) {
        return false;
      }
      currentOwner = nextOwner;
      return true;
    },
    async runCleanupIfCurrentOwner(token: string, cleanup: () => Promise<void>) {
      if (currentOwner?.token !== token) {
        return false;
      }
      await cleanup();
      currentOwner = null;
      return true;
    },
  };
}

describe("startGatewayTailscaleExposure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips stale serve cleanup after a newer gateway takes ownership", async () => {
    const ownerStore = createOwnerStore();
    const logTailscale = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    const cleanupA = await startGatewayTailscaleExposure({
      tailscaleMode: "serve",
      resetOnExit: true,
      port: 18789,
      logTailscale,
      ownerStore,
    });
    const cleanupB = await startGatewayTailscaleExposure({
      tailscaleMode: "serve",
      resetOnExit: true,
      port: 18789,
      logTailscale,
      ownerStore,
    });

    await cleanupA?.();
    expect(tailscaleState.disableServe).not.toHaveBeenCalled();
    expect(logTailscale.info).toHaveBeenCalledWith("serve cleanup skipped: not the current owner");

    await cleanupB?.();
    expect(tailscaleState.disableServe).toHaveBeenCalledTimes(1);
  });

  it("restores the previous owner after a takeover startup failure", async () => {
    const ownerStore = createOwnerStore();
    const logTailscale = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    const cleanupA = await startGatewayTailscaleExposure({
      tailscaleMode: "serve",
      resetOnExit: true,
      port: 18789,
      logTailscale,
      ownerStore,
    });

    tailscaleState.enableServe.mockRejectedValueOnce(new Error("boom"));

    const cleanupB = await startGatewayTailscaleExposure({
      tailscaleMode: "serve",
      resetOnExit: true,
      port: 18789,
      logTailscale,
      ownerStore,
    });

    expect(cleanupB).not.toBeNull();
    expect(logTailscale.warn).toHaveBeenCalledWith("serve failed: boom");

    await cleanupB?.();
    expect(tailscaleState.disableServe).not.toHaveBeenCalled();
    expect(logTailscale.info).toHaveBeenCalledWith("serve cleanup skipped: not the current owner");

    await cleanupA?.();
    expect(tailscaleState.disableServe).toHaveBeenCalledTimes(1);
  });
});
