// Keep provider id strings centralized so capability checks do not diverge.

export const GOOGLE_GEMINI_CLI_API = "google-gemini-cli" as const;
export const GOOGLE_GENERATIVE_AI_API = "google-generative-ai" as const;
export const GOOGLE_ANTIGRAVITY_API = "google-antigravity" as const;

export const GOOGLE_MODEL_APIS = [
  GOOGLE_GEMINI_CLI_API,
  GOOGLE_GENERATIVE_AI_API,
  GOOGLE_ANTIGRAVITY_API,
] as const;

export type GoogleModelApi = (typeof GOOGLE_MODEL_APIS)[number];

export function isGoogleModelApi(api?: string | null): api is GoogleModelApi {
  if (!api) {
    return false;
  }
  const normalized = api.trim().toLowerCase();
  return (GOOGLE_MODEL_APIS as readonly string[]).includes(normalized);
}

export function matchesProviderIdOrModelKey(provider: string, id: string): boolean {
  const normalized = provider.trim().toLowerCase();
  const normalizedId = id.trim().toLowerCase();
  return normalized === normalizedId || normalized.startsWith(`${normalizedId}/`);
}

// Provider families that might appear as:
// - exact: "minimax"
// - variant: "minimax-cn" or "minimax-portal"
// - model key: "minimax/<model>"
export function matchesProviderFamily(provider: string, family: string): boolean {
  const normalized = provider.trim().toLowerCase();
  const f = family.trim().toLowerCase();
  return matchesProviderIdOrModelKey(normalized, f) || normalized.startsWith(`${f}-`);
}
