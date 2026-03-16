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

const modeCases = [
  {
    mode: "serve" as const,
    enableMock: tailscaleState.enableServe,
    disableMock: tailscaleState.disableServe,
  },
  {
    mode: "funnel" as const,
    enableMock: tailscaleState.enableFunnel,
    disableMock: tailscaleState.disableFunnel,
  },
];

describe.each(modeCases)(
  "startGatewayTailscaleExposure ($mode)",
  ({ mode, enableMock, disableMock }) => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.clearAllMocks();
    });

    it("skips stale cleanup after a newer gateway takes ownership", async () => {
      const ownerStore = createOwnerStore();
      const logTailscale = {
        info: vi.fn(),
        warn: vi.fn(),
      };

      const cleanupA = await startGatewayTailscaleExposure({
        tailscaleMode: mode,
        resetOnExit: true,
        port: 18789,
        logTailscale,
        ownerStore,
      });
      const cleanupB = await startGatewayTailscaleExposure({
        tailscaleMode: mode,
        resetOnExit: true,
        port: 18789,
        logTailscale,
        ownerStore,
      });

      await cleanupA?.();
      expect(disableMock).not.toHaveBeenCalled();
      expect(logTailscale.info).toHaveBeenCalledWith(
        `${mode} cleanup skipped: not the current owner`,
      );

      await cleanupB?.();
      expect(disableMock).toHaveBeenCalledTimes(1);
    });

    it("restores the previous live owner after a takeover startup failure", async () => {
      const ownerStore = createOwnerStore();
      const logTailscale = {
        info: vi.fn(),
        warn: vi.fn(),
      };

      const cleanupA = await startGatewayTailscaleExposure({
        tailscaleMode: mode,
        resetOnExit: true,
        port: 18789,
        logTailscale,
        ownerStore,
      });

      enableMock.mockRejectedValueOnce(new Error("boom"));

      const cleanupB = await startGatewayTailscaleExposure({
        tailscaleMode: mode,
        resetOnExit: true,
        port: 18789,
        logTailscale,
        ownerStore,
      });

      expect(cleanupB).not.toBeNull();
      expect(logTailscale.warn).toHaveBeenCalledWith(`${mode} failed: boom`);

      await cleanupB?.();
      expect(disableMock).not.toHaveBeenCalled();
      expect(logTailscale.info).toHaveBeenCalledWith(
        `${mode} cleanup skipped: not the current owner`,
      );

      await cleanupA?.();
      expect(disableMock).toHaveBeenCalledTimes(1);
    });

    it("keeps the failed owner when the previous owner is already gone", async () => {
      const ownerStore = createOwnerStore();
      const logTailscale = {
        info: vi.fn(),
        warn: vi.fn(),
      };

      const cleanupA = await startGatewayTailscaleExposure({
        tailscaleMode: mode,
        resetOnExit: true,
        port: 18789,
        logTailscale,
        ownerStore,
      });

      vi.spyOn(process, "kill").mockImplementation(((pid: number) => {
        if (pid === 1) {
          const err = new Error("gone") as NodeJS.ErrnoException;
          err.code = "ESRCH";
          throw err;
        }
        return true;
      }) as typeof process.kill);
      enableMock.mockRejectedValueOnce(new Error("boom"));

      const cleanupB = await startGatewayTailscaleExposure({
        tailscaleMode: mode,
        resetOnExit: true,
        port: 18789,
        logTailscale,
        ownerStore,
      });

      expect(cleanupB).not.toBeNull();
      expect(logTailscale.warn).toHaveBeenCalledWith(`${mode} failed: boom`);

      await cleanupA?.();
      expect(disableMock).not.toHaveBeenCalled();
      expect(logTailscale.info).toHaveBeenCalledWith(
        `${mode} cleanup skipped: not the current owner`,
      );

      await cleanupB?.();
      expect(disableMock).toHaveBeenCalledTimes(1);
    });

    it("falls back to unguarded cleanup when the ownership guard cannot claim", async () => {
      const logTailscale = {
        info: vi.fn(),
        warn: vi.fn(),
      };

      const cleanup = await startGatewayTailscaleExposure({
        tailscaleMode: mode,
        resetOnExit: true,
        port: 18789,
        logTailscale,
        ownerStore: {
          async claim() {
            throw new Error("lock dir unavailable");
          },
          async replaceIfCurrent() {
            return false;
          },
          async runCleanupIfCurrentOwner() {
            return false;
          },
        },
      });

      expect(cleanup).not.toBeNull();
      expect(enableMock).toHaveBeenCalledTimes(1);
      expect(logTailscale.warn).toHaveBeenCalledWith(
        `${mode} ownership guard unavailable: lock dir unavailable`,
      );

      await cleanup?.();
      expect(disableMock).toHaveBeenCalledTimes(1);
    });
  },
);
