/**
 * Utility functions for provider-specific logic and capabilities.
 */

import {
  GOOGLE_ANTIGRAVITY_API,
  GOOGLE_GENERATIVE_AI_API,
  GOOGLE_GEMINI_CLI_API,
  matchesProviderFamily,
  matchesProviderIdOrModelKey,
} from "./provider-ids.js";

/**
 * Back-compat alias.
 * Prefer requiresReasoningTags() to reduce semantic drift with enforceFinalTag.
 */
export function isReasoningTagProvider(provider: string | undefined | null): boolean {
  return requiresReasoningTags(provider);
}

/**
 * Returns true if the provider requires reasoning to be wrapped in tags
 * (e.g. <think> and <final>) in the text stream, rather than using native
 * API fields for reasoning/thinking.
 */
export function requiresReasoningTags(provider: string | undefined | null): boolean {
  if (!provider) {
    return false;
  }
  const normalized = provider.trim().toLowerCase();

  // Check for exact matches or known prefixes for reasoning providers.
  // Note: Ollama is intentionally excluded - its OpenAI-compatible endpoint
  // handles reasoning natively via the `reasoning` field in streaming chunks,
  // so tag-based enforcement is unnecessary and causes all output to be
  // discarded as "(no output)" (#2279).
  if (normalized === GOOGLE_GEMINI_CLI_API || normalized === GOOGLE_GENERATIVE_AI_API) {
    return true;
  }

  // Handle google-antigravity and its model variations (e.g. google-antigravity/gemini-3)
  if (matchesProviderIdOrModelKey(normalized, GOOGLE_ANTIGRAVITY_API)) {
    return true;
  }

  // Handle Minimax (M2.1 is chatty/reasoning-like)
  if (matchesProviderFamily(normalized, "minimax")) {
    return true;
  }

  return false;
}
