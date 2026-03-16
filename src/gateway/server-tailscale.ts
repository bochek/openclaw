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
  phase: "active" | "cleaning";
  cleanupStartedAt?: string;
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

function createCleanupInProgressError(pid: number): Error {
  const err = new Error(`previous cleanup still in progress (pid ${pid})`);
  err.name = "TailscaleExposureCleanupInProgressError";
  return err;
}

function isCleanupInProgressError(err: unknown): err is Error {
  return err instanceof Error && err.name === "TailscaleExposureCleanupInProgressError";
}

function createTailscaleExposureOwnerStore(): TailscaleExposureOwnerStore {
  const ownerFilePath = path.join(resolveGatewayLockDir(), "tailscale-exposure-owner.json");
  const ownerLockPath = path.join(resolveGatewayLockDir(), "tailscale-exposure-owner.lock");
  const lockRetryMs = 25;
  const lockStaleMs = 60_000;
  const cleanupClaimWaitMs = 20_000;
  let ensureLockDirReady: Promise<void> | null = null;

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
        return {
          ...(parsed as Omit<TailscaleExposureOwnerRecord, "phase">),
          phase: parsed.phase === "cleaning" ? "cleaning" : "active",
          cleanupStartedAt:
            typeof parsed.cleanupStartedAt === "string" ? parsed.cleanupStartedAt : undefined,
        };
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

  function ensureLockDir() {
    if (!ensureLockDirReady) {
      ensureLockDirReady = fs
        .mkdir(path.dirname(ownerLockPath), { recursive: true })
        .catch((err: unknown) => {
          ensureLockDirReady = null;
          throw err;
        });
    }
    return ensureLockDirReady;
  }

  async function breakStaleLock() {
    try {
      const stat = await fs.stat(ownerLockPath);
      if (Date.now() - stat.mtimeMs < lockStaleMs) {
        return;
      }
      try {
        const raw = await fs.readFile(ownerLockPath, "utf8");
        const parsed = JSON.parse(raw) as { pid?: unknown };
        if (typeof parsed.pid === "number" && isPidAlive(parsed.pid)) {
          return;
        }
      } catch {
        // Unreadable lock state is treated as stale so a dead holder cannot block recovery.
      }
      await fs.unlink(ownerLockPath).catch(() => {});
    } catch {
      // Ignore malformed or unreadable lock state and retry.
    }
  }

  async function withOwnerLock<T>(fn: () => Promise<T>): Promise<T> {
    await ensureLockDir();

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
      while (true) {
        const result = await withOwnerLock(async () => {
          const previousOwner = await readOwner();
          if (previousOwner?.phase === "cleaning" && isPidAlive(previousOwner.pid)) {
            const cleanupStartedAtMs = Date.parse(
              previousOwner.cleanupStartedAt ?? previousOwner.claimedAt,
            );
            const cleanupAgeMs = Number.isFinite(cleanupStartedAtMs)
              ? Date.now() - cleanupStartedAtMs
              : Number.POSITIVE_INFINITY;
            if (cleanupAgeMs < cleanupClaimWaitMs) {
              return { type: "wait" as const };
            }
            return { type: "blocked" as const, previousOwner };
          }

          const owner: TailscaleExposureOwnerRecord = {
            token: randomUUID(),
            mode,
            port,
            pid: process.pid,
            claimedAt: new Date().toISOString(),
            phase: "active",
          };
          await fs.writeFile(ownerFilePath, JSON.stringify(owner), "utf8");
          return { type: "claimed" as const, owner, previousOwner };
        });

        if (result.type === "claimed") {
          return result;
        }
        if (result.type === "blocked") {
          throw createCleanupInProgressError(result.previousOwner.pid);
        }
        await sleep(lockRetryMs);
      }
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
      const cleanupOwner = await withOwnerLock(async () => {
        const current = await readOwner();
        if (current?.token !== token) {
          return null;
        }
        // Mark cleanup in progress before releasing the lock so overlapping
        // startups cannot claim exposure until this reset finishes or fails.
        const nextOwner: TailscaleExposureOwnerRecord = {
          ...current,
          phase: "cleaning",
          cleanupStartedAt: new Date().toISOString(),
        };
        await fs.writeFile(ownerFilePath, JSON.stringify(nextOwner), "utf8");
        return nextOwner;
      });
      if (!cleanupOwner) {
        return false;
      }

      try {
        await cleanup();
      } catch (err) {
        await withOwnerLock(async () => {
          const current = await readOwner();
          if (current?.token !== token || current.phase !== "cleaning") {
            return;
          }
          await fs.writeFile(
            ownerFilePath,
            JSON.stringify({
              ...cleanupOwner,
              phase: "active",
              cleanupStartedAt: undefined,
            }),
            "utf8",
          );
        }).catch(() => {});
        throw err;
      }

      await withOwnerLock(async () => {
        const current = await readOwner();
        if (current?.token !== token || current.phase !== "cleaning") {
          return;
        }
        await deleteOwnerFile();
      }).catch(() => {
        // Tailscale cleanup already succeeded. If owner-file deletion fails, leave
        // the stale cleaning record for best-effort recovery after this process exits.
      });
      return true;
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
  let owner: TailscaleExposureOwnerRecord | null = null;
  let previousOwner: TailscaleExposureOwnerRecord | null = null;

  try {
    ({ owner, previousOwner } = await ownerStore.claim(params.tailscaleMode, params.port));
  } catch (err) {
    if (isCleanupInProgressError(err)) {
      params.logTailscale.warn(
        `${params.tailscaleMode} ownership cleanup still in progress; skipping external exposure`,
      );
      return null;
    }
    params.logTailscale.warn(
      `${params.tailscaleMode} ownership guard unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

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
    if (owner) {
      const nextOwner =
        previousOwner && isPidAlive(previousOwner.pid)
          ? previousOwner
          : params.resetOnExit
            ? owner
            : null;
      await ownerStore.replaceIfCurrent(owner.token, nextOwner).catch(() => {});
    }
    params.logTailscale.warn(
      `${params.tailscaleMode} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!params.resetOnExit) {
    return null;
  }

  return async () => {
    try {
      if (owner) {
        const cleanedUp = await ownerStore.runCleanupIfCurrentOwner(owner.token, async () => {
          if (params.tailscaleMode === "serve") {
            await disableTailscaleServe();
          } else {
            await disableTailscaleFunnel();
          }
        });
        if (!cleanedUp) {
          params.logTailscale.info(
            `${params.tailscaleMode} cleanup skipped: not the current owner`,
          );
        }
        return;
      }

      if (params.tailscaleMode === "serve") {
        await disableTailscaleServe();
      } else {
        await disableTailscaleFunnel();
      }
    } catch (err) {
      params.logTailscale.warn(
        `${params.tailscaleMode} cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}
