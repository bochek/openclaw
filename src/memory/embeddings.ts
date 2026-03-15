export {
  createEmbeddingProvider,
  DEFAULT_LOCAL_EMBEDDING_MODEL as DEFAULT_LOCAL_MODEL,
} from "../extension-host/embedding-runtime.js";
export type {
  EmbeddingProvider,
  EmbeddingProviderFallback,
  EmbeddingProviderId,
  EmbeddingProviderOptions,
  EmbeddingProviderRequest,
  EmbeddingProviderResult,
  GeminiEmbeddingClient,
  MistralEmbeddingClient,
  OllamaEmbeddingClient,
  OpenAiEmbeddingClient,
  VoyageEmbeddingClient,
} from "../extension-host/embedding-runtime.js";
