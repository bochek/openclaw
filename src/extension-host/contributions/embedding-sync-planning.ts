import type { EmbeddingProvider } from "./embedding-runtime.js";

export type EmbeddingMemorySource = "memory" | "sessions";

export type EmbeddingIndexMeta = {
  model: string;
  provider: string;
  providerKey?: string;
  sources?: EmbeddingMemorySource[];
  scopeHash?: string;
  chunkTokens: number;
  chunkOverlap: number;
  vectorDims?: number;
};

export type EmbeddingSyncPlan =
  | {
      kind: "targeted-sessions";
      targetSessionFiles: string[];
    }
  | {
      kind: "full-reindex";
      unsafe: boolean;
    }
  | {
      kind: "incremental";
      shouldSyncMemory: boolean;
      shouldSyncSessions: boolean;
      targetSessionFiles?: string[];
    };

export function resolveEmbeddingSyncPlan(params: {
  force?: boolean;
  hasTargetSessionFiles: boolean;
  targetSessionFiles: Set<string> | null;
  sessionsEnabled: boolean;
  dirty: boolean;
  shouldSyncSessions: boolean;
  useUnsafeReindex: boolean;
  vectorReady: boolean;
  meta: EmbeddingIndexMeta | null;
  provider: EmbeddingProvider | null;
  providerKey: string | null;
  configuredSources: EmbeddingMemorySource[];
  configuredScopeHash: string;
  chunkTokens: number;
  chunkOverlap: number;
}): EmbeddingSyncPlan {
  if (params.hasTargetSessionFiles && params.targetSessionFiles && params.sessionsEnabled) {
    return {
      kind: "targeted-sessions",
      targetSessionFiles: Array.from(params.targetSessionFiles),
    };
  }

  const needsFullReindex =
    (params.force && !params.hasTargetSessionFiles) ||
    !params.meta ||
    (params.provider && params.meta.model !== params.provider.model) ||
    (params.provider && params.meta.provider !== params.provider.id) ||
    params.meta?.providerKey !== params.providerKey ||
    metaSourcesDiffer(params.meta, params.configuredSources) ||
    params.meta?.scopeHash !== params.configuredScopeHash ||
    params.meta?.chunkTokens !== params.chunkTokens ||
    params.meta?.chunkOverlap !== params.chunkOverlap ||
    (params.vectorReady && !params.meta?.vectorDims);

  if (needsFullReindex) {
    return {
      kind: "full-reindex",
      unsafe: params.useUnsafeReindex,
    };
  }

  return {
    kind: "incremental",
    shouldSyncMemory: !params.hasTargetSessionFiles && (Boolean(params.force) || params.dirty),
    shouldSyncSessions: params.shouldSyncSessions,
    targetSessionFiles: params.targetSessionFiles
      ? Array.from(params.targetSessionFiles)
      : undefined,
  };
}

export function buildEmbeddingIndexMeta(params: {
  provider: EmbeddingProvider | null;
  providerKey: string | null;
  configuredSources: EmbeddingMemorySource[];
  configuredScopeHash: string;
  chunkTokens: number;
  chunkOverlap: number;
  vectorDims?: number;
}): EmbeddingIndexMeta {
  const meta: EmbeddingIndexMeta = {
    model: params.provider?.model ?? "fts-only",
    provider: params.provider?.id ?? "none",
    providerKey: params.providerKey ?? undefined,
    sources: params.configuredSources,
    scopeHash: params.configuredScopeHash,
    chunkTokens: params.chunkTokens,
    chunkOverlap: params.chunkOverlap,
  };
  if (params.vectorDims) {
    meta.vectorDims = params.vectorDims;
  }
  return meta;
}

export function shouldUseUnsafeEmbeddingReindex(env = process.env): boolean {
  return env.OPENCLAW_TEST_FAST === "1" && env.OPENCLAW_TEST_MEMORY_UNSAFE_REINDEX === "1";
}

export function metaSourcesDiffer(
  meta: EmbeddingIndexMeta | null,
  configuredSources: EmbeddingMemorySource[],
): boolean {
  const metaSources = normalizeEmbeddingMetaSources(meta);
  if (metaSources.length !== configuredSources.length) {
    return true;
  }
  return metaSources.some((source, index) => source !== configuredSources[index]);
}

export function normalizeEmbeddingMetaSources(
  meta: Pick<EmbeddingIndexMeta, "sources"> | null,
): EmbeddingMemorySource[] {
  if (!Array.isArray(meta?.sources)) {
    return ["memory"];
  }
  const normalized = Array.from(
    new Set(
      meta.sources.filter(
        (source): source is EmbeddingMemorySource => source === "memory" || source === "sessions",
      ),
    ),
  ).toSorted();
  return normalized.length > 0 ? normalized : ["memory"];
}
