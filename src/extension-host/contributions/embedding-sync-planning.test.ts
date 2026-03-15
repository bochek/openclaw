import { describe, expect, it } from "vitest";
import {
  buildEmbeddingIndexMeta,
  metaSourcesDiffer,
  normalizeEmbeddingMetaSources,
  resolveEmbeddingSyncPlan,
  shouldUseUnsafeEmbeddingReindex,
} from "./embedding-sync-planning.js";

describe("embedding-sync-planning", () => {
  it("prefers targeted session refreshes over broader sync decisions", () => {
    const plan = resolveEmbeddingSyncPlan({
      hasTargetSessionFiles: true,
      targetSessionFiles: new Set(["/tmp/session.jsonl"]),
      sessionsEnabled: true,
      dirty: true,
      shouldSyncSessions: true,
      useUnsafeReindex: false,
      vectorReady: false,
      meta: null,
      provider: null,
      providerKey: null,
      configuredSources: ["sessions"],
      configuredScopeHash: "scope",
      chunkTokens: 200,
      chunkOverlap: 20,
    });

    expect(plan).toEqual({
      kind: "targeted-sessions",
      targetSessionFiles: ["/tmp/session.jsonl"],
    });
  });

  it("plans a full reindex when metadata drift is detected", () => {
    const plan = resolveEmbeddingSyncPlan({
      force: false,
      hasTargetSessionFiles: false,
      targetSessionFiles: null,
      sessionsEnabled: true,
      dirty: false,
      shouldSyncSessions: false,
      useUnsafeReindex: true,
      vectorReady: true,
      meta: {
        model: "old-model",
        provider: "openai",
        providerKey: "key",
        sources: ["memory"],
        scopeHash: "scope",
        chunkTokens: 200,
        chunkOverlap: 20,
      },
      provider: {
        id: "openai",
        model: "new-model",
        embedQuery: async () => [1],
        embedBatch: async () => [[1]],
      },
      providerKey: "key",
      configuredSources: ["memory"],
      configuredScopeHash: "scope",
      chunkTokens: 200,
      chunkOverlap: 20,
    });

    expect(plan).toEqual({
      kind: "full-reindex",
      unsafe: true,
    });
  });

  it("builds incremental sync plans from dirty/session state", () => {
    const plan = resolveEmbeddingSyncPlan({
      force: false,
      hasTargetSessionFiles: false,
      targetSessionFiles: null,
      sessionsEnabled: true,
      dirty: true,
      shouldSyncSessions: true,
      useUnsafeReindex: false,
      vectorReady: false,
      meta: {
        model: "model",
        provider: "openai",
        providerKey: "key",
        sources: ["memory", "sessions"],
        scopeHash: "scope",
        chunkTokens: 200,
        chunkOverlap: 20,
        vectorDims: 1536,
      },
      provider: {
        id: "openai",
        model: "model",
        embedQuery: async () => [1],
        embedBatch: async () => [[1]],
      },
      providerKey: "key",
      configuredSources: ["memory", "sessions"],
      configuredScopeHash: "scope",
      chunkTokens: 200,
      chunkOverlap: 20,
    });

    expect(plan).toEqual({
      kind: "incremental",
      shouldSyncMemory: true,
      shouldSyncSessions: true,
      targetSessionFiles: undefined,
    });
  });

  it("builds embedding metadata with provider and vector dimensions", () => {
    expect(
      buildEmbeddingIndexMeta({
        provider: {
          id: "openai",
          model: "text-embedding-3-small",
          embedQuery: async () => [1],
          embedBatch: async () => [[1]],
        },
        providerKey: "provider-key",
        configuredSources: ["memory", "sessions"],
        configuredScopeHash: "scope",
        chunkTokens: 256,
        chunkOverlap: 32,
        vectorDims: 1536,
      }),
    ).toEqual({
      model: "text-embedding-3-small",
      provider: "openai",
      providerKey: "provider-key",
      sources: ["memory", "sessions"],
      scopeHash: "scope",
      chunkTokens: 256,
      chunkOverlap: 32,
      vectorDims: 1536,
    });
  });

  it("normalizes legacy meta sources and detects drift", () => {
    expect(normalizeEmbeddingMetaSources(null)).toEqual(["memory"]);
    expect(normalizeEmbeddingMetaSources({ sources: ["sessions", "memory", "sessions"] })).toEqual([
      "memory",
      "sessions",
    ]);
    expect(
      metaSourcesDiffer(
        {
          model: "model",
          provider: "openai",
          sources: ["memory"],
          chunkTokens: 200,
          chunkOverlap: 20,
        },
        ["memory", "sessions"],
      ),
    ).toBe(true);
  });

  it("reads the unsafe test reindex gate from env vars", () => {
    expect(
      shouldUseUnsafeEmbeddingReindex({
        OPENCLAW_TEST_FAST: "1",
        OPENCLAW_TEST_MEMORY_UNSAFE_REINDEX: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(shouldUseUnsafeEmbeddingReindex({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
