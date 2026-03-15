import type { OpenClawConfig } from "../../config/config.js";
import type { SecretInput } from "../../config/types.secrets.js";
import type { EmbeddingInput } from "../../memory/embedding-inputs.js";
import type { GeminiEmbeddingClient, GeminiTaskType } from "../../memory/embeddings-gemini.js";
import type { MistralEmbeddingClient } from "../../memory/embeddings-mistral.js";
import type { OllamaEmbeddingClient } from "../../memory/embeddings-ollama.js";
import type { OpenAiEmbeddingClient } from "../../memory/embeddings-openai.js";
import type { VoyageEmbeddingClient } from "../../memory/embeddings-voyage.js";

export type { GeminiEmbeddingClient } from "../../memory/embeddings-gemini.js";
export type { MistralEmbeddingClient } from "../../memory/embeddings-mistral.js";
export type { OpenAiEmbeddingClient } from "../../memory/embeddings-openai.js";
export type { VoyageEmbeddingClient } from "../../memory/embeddings-voyage.js";
export type { OllamaEmbeddingClient } from "../../memory/embeddings-ollama.js";

export type EmbeddingProvider = {
  id: string;
  model: string;
  maxInputTokens?: number;
  embedQuery: (text: string) => Promise<number[]>;
  embedBatch: (texts: string[]) => Promise<number[][]>;
  embedBatchInputs?: (inputs: EmbeddingInput[]) => Promise<number[][]>;
};

export type EmbeddingProviderId = "openai" | "local" | "gemini" | "voyage" | "mistral" | "ollama";
export type EmbeddingProviderRequest = EmbeddingProviderId | "auto";
export type EmbeddingProviderFallback = EmbeddingProviderId | "none";

export type EmbeddingProviderResult = {
  provider: EmbeddingProvider | null;
  requestedProvider: EmbeddingProviderRequest;
  fallbackFrom?: EmbeddingProviderId;
  fallbackReason?: string;
  providerUnavailableReason?: string;
  openAi?: OpenAiEmbeddingClient;
  gemini?: GeminiEmbeddingClient;
  voyage?: VoyageEmbeddingClient;
  mistral?: MistralEmbeddingClient;
  ollama?: OllamaEmbeddingClient;
};

export type EmbeddingProviderOptions = {
  config: OpenClawConfig;
  agentDir?: string;
  provider: EmbeddingProviderRequest;
  remote?: {
    baseUrl?: string;
    apiKey?: SecretInput;
    headers?: Record<string, string>;
  };
  model: string;
  fallback: EmbeddingProviderFallback;
  local?: {
    modelPath?: string;
    modelCacheDir?: string;
  };
  /** Gemini embedding-2: output vector dimensions (768, 1536, or 3072). */
  outputDimensionality?: number;
  /** Gemini: override the default task type sent with embedding requests. */
  taskType?: GeminiTaskType;
};
