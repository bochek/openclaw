import { GOOGLE_ANTIGRAVITY_API, isGoogleModelApi } from "../../utils/provider-ids.js";
import { sanitizeGoogleTurnOrdering } from "./bootstrap.js";

export { isGoogleModelApi };

export function isAntigravityClaude(params: {
  api?: string | null;
  provider?: string | null;
  modelId?: string;
}): boolean {
  const provider = params.provider?.toLowerCase();
  const api = params.api?.toLowerCase();
  if (provider !== GOOGLE_ANTIGRAVITY_API && api !== GOOGLE_ANTIGRAVITY_API) {
    return false;
  }
  return params.modelId?.toLowerCase().includes("claude") ?? false;
}

export { sanitizeGoogleTurnOrdering };
