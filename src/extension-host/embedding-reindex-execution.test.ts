import { describe, expect, it, vi } from "vitest";
import {
  resetExtensionHostEmbeddingIndexStore,
  runExtensionHostEmbeddingReindexBody,
} from "./embedding-reindex-execution.js";

describe("embedding-reindex-execution", () => {
  it("runs full reindex syncs, clears dirty flags, and writes metadata", async () => {
    const syncMemoryFiles = vi.fn(async () => {});
    const syncSessionFiles = vi.fn(async () => {});
    const setDirty = vi.fn();
    const setSessionsDirty = vi.fn();
    const clearAllSessionDirtyFiles = vi.fn();
    const writeMeta = vi.fn();
    const pruneEmbeddingCacheIfNeeded = vi.fn();

    const nextMeta = await runExtensionHostEmbeddingReindexBody({
      shouldSyncMemory: true,
      shouldSyncSessions: true,
      hasDirtySessionFiles: true,
      syncMemoryFiles,
      syncSessionFiles,
      setDirty,
      setSessionsDirty,
      clearAllSessionDirtyFiles,
      buildNextMeta: () => ({
        model: "model",
        provider: "openai",
        providerKey: "key",
        sources: ["memory", "sessions"],
        scopeHash: "scope",
        chunkTokens: 200,
        chunkOverlap: 20,
      }),
      vectorDims: 1536,
      writeMeta,
      pruneEmbeddingCacheIfNeeded,
    });

    expect(syncMemoryFiles).toHaveBeenCalledWith({
      needsFullReindex: true,
      progress: undefined,
    });
    expect(syncSessionFiles).toHaveBeenCalledWith({
      needsFullReindex: true,
      progress: undefined,
    });
    expect(setDirty).toHaveBeenCalledWith(false);
    expect(setSessionsDirty).toHaveBeenCalledWith(false);
    expect(clearAllSessionDirtyFiles).toHaveBeenCalled();
    expect(writeMeta).toHaveBeenCalledWith({
      model: "model",
      provider: "openai",
      providerKey: "key",
      sources: ["memory", "sessions"],
      scopeHash: "scope",
      chunkTokens: 200,
      chunkOverlap: 20,
      vectorDims: 1536,
    });
    expect(pruneEmbeddingCacheIfNeeded).toHaveBeenCalled();
    expect(nextMeta.vectorDims).toBe(1536);
  });

  it("preserves session dirty state when sessions are not reindexed", async () => {
    const setSessionsDirty = vi.fn();

    await runExtensionHostEmbeddingReindexBody({
      shouldSyncMemory: false,
      shouldSyncSessions: false,
      hasDirtySessionFiles: true,
      syncMemoryFiles: vi.fn(async () => {}),
      syncSessionFiles: vi.fn(async () => {}),
      setDirty: vi.fn(),
      setSessionsDirty,
      clearAllSessionDirtyFiles: vi.fn(),
      buildNextMeta: () => ({
        model: "model",
        provider: "openai",
        chunkTokens: 200,
        chunkOverlap: 20,
      }),
      writeMeta: vi.fn(),
    });

    expect(setSessionsDirty).toHaveBeenCalledWith(true);
  });

  it("resets the index store and FTS rows when available", () => {
    const execSql = vi.fn();
    const dropVectorTable = vi.fn();
    const clearVectorDims = vi.fn();
    const clearAllSessionDirtyFiles = vi.fn();

    resetExtensionHostEmbeddingIndexStore({
      execSql,
      ftsEnabled: true,
      ftsAvailable: true,
      ftsTable: "chunks_fts",
      dropVectorTable,
      clearVectorDims,
      clearAllSessionDirtyFiles,
    });

    expect(execSql).toHaveBeenNthCalledWith(1, "DELETE FROM files");
    expect(execSql).toHaveBeenNthCalledWith(2, "DELETE FROM chunks");
    expect(execSql).toHaveBeenNthCalledWith(3, "DELETE FROM chunks_fts");
    expect(dropVectorTable).toHaveBeenCalled();
    expect(clearVectorDims).toHaveBeenCalled();
    expect(clearAllSessionDirtyFiles).toHaveBeenCalled();
  });
});
