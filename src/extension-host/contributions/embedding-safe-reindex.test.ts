import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  moveExtensionHostIndexFiles,
  removeExtensionHostIndexFiles,
  runExtensionHostEmbeddingSafeReindex,
  swapExtensionHostIndexFiles,
} from "./embedding-safe-reindex.js";

async function writeIndexFiles(basePath: string, value: string): Promise<void> {
  await fs.writeFile(basePath, `${value}-db`);
  await fs.writeFile(`${basePath}-wal`, `${value}-wal`);
  await fs.writeFile(`${basePath}-shm`, `${value}-shm`);
}

async function readIndexFiles(basePath: string): Promise<string[]> {
  return await Promise.all([
    fs.readFile(basePath, "utf8"),
    fs.readFile(`${basePath}-wal`, "utf8"),
    fs.readFile(`${basePath}-shm`, "utf8"),
  ]);
}

describe("embedding-safe-reindex", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map(async (root) => await fs.rm(root, { recursive: true, force: true })),
    );
    tempRoots.length = 0;
  });

  it("moves, swaps, and removes index sidecar files together", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-embed-safe-reindex-"));
    tempRoots.push(root);
    const sourcePath = path.join(root, "source.sqlite");
    const targetPath = path.join(root, "target.sqlite");

    await writeIndexFiles(sourcePath, "source");
    await moveExtensionHostIndexFiles(sourcePath, targetPath);
    await expect(readIndexFiles(targetPath)).resolves.toEqual([
      "source-db",
      "source-wal",
      "source-shm",
    ]);

    await writeIndexFiles(sourcePath, "new-source");
    await swapExtensionHostIndexFiles(targetPath, sourcePath, "backup-id");
    await expect(readIndexFiles(targetPath)).resolves.toEqual([
      "new-source-db",
      "new-source-wal",
      "new-source-shm",
    ]);

    await removeExtensionHostIndexFiles(targetPath);
    await expect(fs.stat(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("runs the safe reindex flow, swaps files, and reopens the active database", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-embed-safe-reindex-"));
    tempRoots.push(root);
    const dbPath = path.join(root, "index.sqlite");
    await writeIndexFiles(dbPath, "active");

    const closeDatabase = vi.fn();
    const captureOriginalState = vi.fn(() => ({ state: "original" }));
    const restoreOriginalState = vi.fn();
    const prepareTempDb = vi.fn();
    const seedEmbeddingCache = vi.fn();
    const reopenAfterSwap = vi.fn();

    const currentDb = { label: "current" };
    const openDatabaseAtPath = vi.fn((openedPath: string) => {
      if (openedPath !== dbPath) {
        void writeIndexFiles(openedPath, "temp");
      }
      return { label: openedPath };
    });

    const nextMeta = await runExtensionHostEmbeddingSafeReindex({
      dbPath,
      currentDb,
      openDatabaseAtPath,
      closeDatabase,
      captureOriginalState,
      restoreOriginalState,
      prepareTempDb,
      seedEmbeddingCache,
      runReindexBody: async () => ({ vectorDims: 1536 }),
      reopenAfterSwap,
      randomId: () => "temp-id",
    });

    expect(nextMeta).toEqual({ vectorDims: 1536 });
    expect(prepareTempDb).toHaveBeenCalledWith({ label: `${dbPath}.tmp-temp-id` });
    expect(seedEmbeddingCache).toHaveBeenCalledWith(currentDb);
    expect(closeDatabase).toHaveBeenCalledTimes(2);
    expect(reopenAfterSwap).toHaveBeenCalledWith(dbPath, { vectorDims: 1536 });
    expect(restoreOriginalState).not.toHaveBeenCalled();
    await expect(readIndexFiles(dbPath)).resolves.toEqual(["temp-db", "temp-wal", "temp-shm"]);
  });

  it("restores original state and removes temp files when reindex body fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-embed-safe-reindex-"));
    tempRoots.push(root);
    const dbPath = path.join(root, "index.sqlite");
    await writeIndexFiles(dbPath, "active");

    const currentDb = { label: "current" };
    const restoreOriginalState = vi.fn();
    const closeDatabase = vi.fn();
    const openDatabaseAtPath = vi.fn((openedPath: string) => {
      if (openedPath !== dbPath) {
        void writeIndexFiles(openedPath, "temp");
      }
      return { label: openedPath };
    });

    await expect(
      runExtensionHostEmbeddingSafeReindex({
        dbPath,
        currentDb,
        openDatabaseAtPath,
        closeDatabase,
        captureOriginalState: () => ({ state: "original" }),
        restoreOriginalState,
        prepareTempDb: vi.fn(),
        seedEmbeddingCache: vi.fn(),
        runReindexBody: async () => {
          throw new Error("boom");
        },
        reopenAfterSwap: vi.fn(),
        randomId: () => "temp-id",
      }),
    ).rejects.toThrow("boom");

    expect(restoreOriginalState).toHaveBeenCalledWith({
      originalDb: currentDb,
      originalState: { state: "original" },
      originalDbClosed: false,
      dbPath,
    });
    await expect(readIndexFiles(dbPath)).resolves.toEqual([
      "active-db",
      "active-wal",
      "active-shm",
    ]);
    await expect(fs.stat(`${dbPath}.tmp-temp-id`)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
