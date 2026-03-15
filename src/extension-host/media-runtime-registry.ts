import { normalizeProviderId } from "../agents/provider-id.js";
import { anthropicProvider } from "../media-understanding/providers/anthropic/index.js";
import { deepgramProvider } from "../media-understanding/providers/deepgram/index.js";
import { googleProvider } from "../media-understanding/providers/google/index.js";
import { groqProvider } from "../media-understanding/providers/groq/index.js";
import {
  minimaxPortalProvider,
  minimaxProvider,
} from "../media-understanding/providers/minimax/index.js";
import { mistralProvider } from "../media-understanding/providers/mistral/index.js";
import { moonshotProvider } from "../media-understanding/providers/moonshot/index.js";
import { openaiProvider } from "../media-understanding/providers/openai/index.js";
import { zaiProvider } from "../media-understanding/providers/zai/index.js";
import type { MediaUnderstandingProvider } from "../media-understanding/types.js";

const EXTENSION_HOST_MEDIA_PROVIDERS: readonly MediaUnderstandingProvider[] = [
  groqProvider,
  openaiProvider,
  googleProvider,
  anthropicProvider,
  minimaxProvider,
  minimaxPortalProvider,
  moonshotProvider,
  mistralProvider,
  zaiProvider,
  deepgramProvider,
];

export type ExtensionHostMediaUnderstandingProviderRegistry = Map<
  string,
  MediaUnderstandingProvider
>;

export function normalizeExtensionHostMediaProviderId(id: string): string {
  const normalized = normalizeProviderId(id);
  if (normalized === "gemini") {
    return "google";
  }
  return normalized;
}

export function buildExtensionHostMediaUnderstandingRegistry(
  overrides?: Record<string, MediaUnderstandingProvider>,
): ExtensionHostMediaUnderstandingProviderRegistry {
  const registry: ExtensionHostMediaUnderstandingProviderRegistry = new Map();
  for (const provider of EXTENSION_HOST_MEDIA_PROVIDERS) {
    registry.set(normalizeExtensionHostMediaProviderId(provider.id), provider);
  }
  if (!overrides) {
    return registry;
  }

  for (const [key, provider] of Object.entries(overrides)) {
    const normalizedKey = normalizeExtensionHostMediaProviderId(key);
    const existing = registry.get(normalizedKey);
    const merged = existing
      ? {
          ...existing,
          ...provider,
          capabilities: provider.capabilities ?? existing.capabilities,
        }
      : provider;
    registry.set(normalizedKey, merged);
  }
  return registry;
}

export function getExtensionHostMediaUnderstandingProvider(
  id: string,
  registry: ExtensionHostMediaUnderstandingProviderRegistry,
): MediaUnderstandingProvider | undefined {
  return registry.get(normalizeExtensionHostMediaProviderId(id));
}
