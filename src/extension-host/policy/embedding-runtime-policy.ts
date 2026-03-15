import type {
  EmbeddingProviderFallback,
  EmbeddingProviderId,
  EmbeddingProviderRequest,
} from "../contributions/embedding-runtime-types.js";
import { resolveExtensionHostEmbeddingRuntimeDefaultModel } from "../static/embedding-runtime-backends.js";
import { listExtensionHostEmbeddingRuntimeBackendCatalogEntries } from "../static/runtime-backend-catalog.js";
import { resolveExtensionHostRuntimeBackendIdsByPolicy } from "./runtime-backend-policy.js";

export function listExtensionHostEmbeddingRemoteRuntimeBackendIds(): readonly EmbeddingProviderId[] {
  return resolveExtensionHostRuntimeBackendIdsByPolicy({
    entries: listExtensionHostEmbeddingRuntimeBackendCatalogEntries(),
    subsystemId: "embedding",
    include: (entry) => entry.backendId !== "local" && entry.metadata?.autoSelectable === true,
  }).map((backendId) => backendId as EmbeddingProviderId);
}

export function resolveExtensionHostEmbeddingFallbackPolicy(params: {
  requestedProvider: EmbeddingProviderRequest | EmbeddingProviderId;
  fallback: EmbeddingProviderFallback | undefined;
  configuredModel: string;
}): {
  provider: EmbeddingProviderId;
  model: string;
} | null {
  const fallback = params.fallback;
  if (!fallback || fallback === "none" || fallback === params.requestedProvider) {
    return null;
  }
  return {
    provider: fallback,
    model: resolveExtensionHostEmbeddingFallbackModel(fallback, params.configuredModel),
  };
}

export function resolveExtensionHostEmbeddingFallbackModel(
  fallback: Exclude<EmbeddingProviderFallback, "none">,
  configuredModel: string,
): string {
  return fallback === "local"
    ? configuredModel
    : resolveExtensionHostEmbeddingRuntimeDefaultModel(fallback);
}
