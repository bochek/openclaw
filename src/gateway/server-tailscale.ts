import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveGatewayLockDir } from "../config/paths.js";
import {
  disableTailscaleFunnel,
  disableTailscaleServe,
  enableTailscaleFunnel,
  enableTailscaleServe,
  getTailnetHostname,
} from "../infra/tailscale.js";

type GatewayTailscaleMode = "off" | "serve" | "funnel";

type TailscaleExposureOwnerRecord = {
  token: string;
  mode: Exclude<GatewayTailscaleMode, "off">;
  port: number;
  pid: number;
  claimedAt: string;
};

type TailscaleExposureOwnerStore = {
  claim(
    mode: Exclude<GatewayTailscaleMode, "off">,
    port: number,
  ): Promise<{
    owner: TailscaleExposureOwnerRecord;
    previousOwner: TailscaleExposureOwnerRecord | null;
  }>;
  replaceIfCurrent(token: string, nextOwner: TailscaleExposureOwnerRecord | null): Promise<boolean>;
  runCleanupIfCurrentOwner(token: string, cleanup: () => Promise<void>): Promise<boolean>;
};

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException | undefined)?.code !== "ESRCH";
  }
}

function createTailscaleExposureOwnerStore(): TailscaleExposureOwnerStore {
  const ownerFilePath = path.join(resolveGatewayLockDir(), "tailscale-exposure-owner.json");
  const ownerLockPath = path.join(resolveGatewayLockDir(), "tailscale-exposure-owner.lock");
  const lockRetryMs = 25;
  const lockStaleMs = 60_000;

  async function readOwner(): Promise<TailscaleExposureOwnerRecord | null> {
    try {
      const raw = await fs.readFile(ownerFilePath, "utf8");
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.token === "string" &&
        typeof parsed.mode === "string" &&
        typeof parsed.port === "number" &&
        typeof parsed.pid === "number" &&
        typeof parsed.claimedAt === "string"
      ) {
        return parsed as TailscaleExposureOwnerRecord;
      }
    } catch {
      // ENOENT means the file does not exist yet. Any other parse/read error is
      // also ignored so the ownership guard remains best-effort and non-fatal.
    }
    return null;
  }

  async function sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function breakStaleLock() {
    try {
      const stat = await fs.stat(ownerLockPath);
      if (Date.now() - stat.mtimeMs < lockStaleMs) {
        return;
      }
      // All lock holders only perform short file I/O plus the Tailscale CLI calls,
      // and those helpers already time out after 15s. If the lock still exists after
      // the wider stale window, assume the holder is wedged and break it.
      await fs.unlink(ownerLockPath).catch(() => {});
    } catch (err) {
      if ((err as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
        // Ignore malformed or unreadable lock state and retry.
      }
    }
  }

  async function withOwnerLock<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(path.dirname(ownerLockPath), { recursive: true });

    while (true) {
      try {
        const handle = await fs.open(ownerLockPath, "wx");
        try {
          await handle.writeFile(
            JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }),
          );
          return await fn();
        } finally {
          await handle.close().catch(() => {});
          await fs.unlink(ownerLockPath).catch(() => {});
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException | undefined)?.code !== "EEXIST") {
          throw err;
        }
        await breakStaleLock();
        await sleep(lockRetryMs);
      }
    }
  }

  async function deleteOwnerFile() {
    await fs.unlink(ownerFilePath).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
        throw err;
      }
    });
  }

  return {
    async claim(mode, port) {
      return await withOwnerLock(async () => {
        const previousOwner = await readOwner();
        const owner: TailscaleExposureOwnerRecord = {
          token: randomUUID(),
          mode,
          port,
          pid: process.pid,
          claimedAt: new Date().toISOString(),
        };
        await fs.writeFile(ownerFilePath, JSON.stringify(owner), "utf8");
        return { owner, previousOwner };
      });
    },
    async replaceIfCurrent(token, nextOwner) {
      return await withOwnerLock(async () => {
        const current = await readOwner();
        if (current?.token !== token) {
          return false;
        }
        if (nextOwner) {
          await fs.writeFile(ownerFilePath, JSON.stringify(nextOwner), "utf8");
        } else {
          await deleteOwnerFile();
        }
        return true;
      });
    },
    async runCleanupIfCurrentOwner(token, cleanup) {
      return await withOwnerLock(async () => {
        const current = await readOwner();
        if (current?.token !== token) {
          return false;
        }
        await cleanup();
        await deleteOwnerFile();
        return true;
      });
    },
  };
}

export async function startGatewayTailscaleExposure(params: {
  tailscaleMode: GatewayTailscaleMode;
  resetOnExit?: boolean;
  port: number;
  controlUiBasePath?: string;
  logTailscale: { info: (msg: string) => void; warn: (msg: string) => void };
  ownerStore?: TailscaleExposureOwnerStore;
}): Promise<(() => Promise<void>) | null> {
  if (params.tailscaleMode === "off") {
    return null;
  }

  const ownerStore = params.ownerStore ?? createTailscaleExposureOwnerStore();
  const { owner, previousOwner } = await ownerStore.claim(params.tailscaleMode, params.port);

  try {
    if (params.tailscaleMode === "serve") {
      await enableTailscaleServe(params.port);
    } else {
      await enableTailscaleFunnel(params.port);
    }
    const host = await getTailnetHostname().catch(() => null);
    if (host) {
      const uiPath = params.controlUiBasePath ? `${params.controlUiBasePath}/` : "/";
      params.logTailscale.info(
        `${params.tailscaleMode} enabled: https://${host}${uiPath} (WS via wss://${host})`,
      );
    } else {
      params.logTailscale.info(`${params.tailscaleMode} enabled`);
    }
  } catch (err) {
    const nextOwner =
      previousOwner && isPidAlive(previousOwner.pid)
        ? previousOwner
        : params.resetOnExit
          ? owner
          : null;
    await ownerStore.replaceIfCurrent(owner.token, nextOwner).catch(() => {});
    params.logTailscale.warn(
      `${params.tailscaleMode} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!params.resetOnExit) {
    return null;
  }

  return async () => {
    try {
      const cleanedUp = await ownerStore.runCleanupIfCurrentOwner(owner.token, async () => {
        if (params.tailscaleMode === "serve") {
          await disableTailscaleServe();
        } else {
          await disableTailscaleFunnel();
        }
      });
      if (!cleanedUp) {
        params.logTailscale.info(`${params.tailscaleMode} cleanup skipped: not the current owner`);
      }
    } catch (err) {
      params.logTailscale.warn(
        `${params.tailscaleMode} cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}
