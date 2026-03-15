import type { EmbeddingIndexMeta } from "./embedding-sync-planning.js";

type EmbeddingReindexProgress = unknown;

type EmbeddingReindexMemoryFiles<TProgress = EmbeddingReindexProgress> = (params: {
  needsFullReindex: boolean;
  progress?: TProgress;
}) => Promise<void>;

type EmbeddingReindexSessionFiles<TProgress = EmbeddingReindexProgress> = (params: {
  needsFullReindex: boolean;
  progress?: TProgress;
}) => Promise<void>;

export async function runExtensionHostEmbeddingReindexBody<
  TProgress = EmbeddingReindexProgress,
>(params: {
  shouldSyncMemory: boolean;
  shouldSyncSessions: boolean;
  hasDirtySessionFiles: boolean;
  progress?: TProgress;
  syncMemoryFiles: EmbeddingReindexMemoryFiles<TProgress>;
  syncSessionFiles: EmbeddingReindexSessionFiles<TProgress>;
  setDirty: (value: boolean) => void;
  setSessionsDirty: (value: boolean) => void;
  clearAllSessionDirtyFiles: () => void;
  buildNextMeta: () => EmbeddingIndexMeta;
  vectorDims?: number;
  writeMeta: (meta: EmbeddingIndexMeta) => void;
  pruneEmbeddingCacheIfNeeded?: () => void;
}): Promise<EmbeddingIndexMeta> {
  if (params.shouldSyncMemory) {
    await params.syncMemoryFiles({
      needsFullReindex: true,
      progress: params.progress,
    });
    params.setDirty(false);
  }

  if (params.shouldSyncSessions) {
    await params.syncSessionFiles({
      needsFullReindex: true,
      progress: params.progress,
    });
    params.setSessionsDirty(false);
    params.clearAllSessionDirtyFiles();
  } else {
    params.setSessionsDirty(params.hasDirtySessionFiles);
  }

  const nextMeta = params.buildNextMeta();
  if (params.vectorDims) {
    nextMeta.vectorDims = params.vectorDims;
  }

  params.writeMeta(nextMeta);
  params.pruneEmbeddingCacheIfNeeded?.();
  return nextMeta;
}

export function resetExtensionHostEmbeddingIndexStore(params: {
  execSql: (sql: string) => void;
  ftsEnabled: boolean;
  ftsAvailable: boolean;
  ftsTable: string;
  dropVectorTable: () => void;
  clearVectorDims: () => void;
  clearAllSessionDirtyFiles: () => void;
}): void {
  params.execSql("DELETE FROM files");
  params.execSql("DELETE FROM chunks");
  if (params.ftsEnabled && params.ftsAvailable) {
    try {
      params.execSql(`DELETE FROM ${params.ftsTable}`);
    } catch {}
  }
  params.dropVectorTable();
  params.clearVectorDims();
  params.clearAllSessionDirtyFiles();
}
