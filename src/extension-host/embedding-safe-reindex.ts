import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

const INDEX_FILE_SUFFIXES = ["", "-wal", "-shm"];

export async function moveExtensionHostIndexFiles(
  sourceBase: string,
  targetBase: string,
): Promise<void> {
  for (const suffix of INDEX_FILE_SUFFIXES) {
    const source = `${sourceBase}${suffix}`;
    const target = `${targetBase}${suffix}`;
    try {
      await fs.rename(source, target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }
}

export async function removeExtensionHostIndexFiles(basePath: string): Promise<void> {
  await Promise.all(
    INDEX_FILE_SUFFIXES.map((suffix) => fs.rm(`${basePath}${suffix}`, { force: true })),
  );
}

export async function swapExtensionHostIndexFiles(
  targetPath: string,
  tempPath: string,
  backupId = randomUUID(),
): Promise<void> {
  const backupPath = `${targetPath}.backup-${backupId}`;
  await moveExtensionHostIndexFiles(targetPath, backupPath);
  try {
    await moveExtensionHostIndexFiles(tempPath, targetPath);
  } catch (err) {
    await moveExtensionHostIndexFiles(backupPath, targetPath);
    throw err;
  }
  await removeExtensionHostIndexFiles(backupPath);
}

export async function runExtensionHostEmbeddingSafeReindex<
  TDb,
  TState,
  TMeta extends { vectorDims?: number },
>(params: {
  dbPath: string;
  currentDb: TDb;
  openDatabaseAtPath: (dbPath: string) => TDb;
  closeDatabase: (db: TDb) => void;
  captureOriginalState: () => TState;
  restoreOriginalState: (params: {
    originalDb: TDb;
    originalState: TState;
    originalDbClosed: boolean;
    dbPath: string;
  }) => void;
  prepareTempDb: (tempDb: TDb) => void;
  seedEmbeddingCache: (sourceDb: TDb) => void;
  runReindexBody: () => Promise<TMeta>;
  reopenAfterSwap: (dbPath: string, nextMeta: TMeta) => void;
  randomId?: () => string;
}): Promise<TMeta> {
  const tempDbPath = `${params.dbPath}.tmp-${(params.randomId ?? randomUUID)()}`;
  const tempDb = params.openDatabaseAtPath(tempDbPath);
  const originalDb = params.currentDb;
  const originalState = params.captureOriginalState();
  let originalDbClosed = false;

  params.prepareTempDb(tempDb);

  try {
    params.seedEmbeddingCache(originalDb);
    const nextMeta = await params.runReindexBody();

    params.closeDatabase(tempDb);
    params.closeDatabase(originalDb);
    originalDbClosed = true;

    await swapExtensionHostIndexFiles(params.dbPath, tempDbPath);
    params.reopenAfterSwap(params.dbPath, nextMeta);
    return nextMeta;
  } catch (err) {
    try {
      params.closeDatabase(tempDb);
    } catch {}
    await removeExtensionHostIndexFiles(tempDbPath);
    params.restoreOriginalState({
      originalDb,
      originalState,
      originalDbClosed,
      dbPath: params.dbPath,
    });
    throw err;
  }
}
