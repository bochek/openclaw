import { isNonSecretApiKeyMarker } from "./model-auth-markers.js";

const DEFAULT_KEY_PREVIEW = { head: 4, tail: 4 };
const loggedProviderAuthSummaries = new Set<string>();

function formatApiKeyPreview(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "…";
  }
  const { head, tail } = DEFAULT_KEY_PREVIEW;
  if (trimmed.length <= head + tail) {
    const shortHead = Math.min(2, trimmed.length);
    const shortTail = Math.min(2, trimmed.length - shortHead);
    if (shortTail <= 0) {
      return `${trimmed.slice(0, shortHead)}…`;
    }
    return `${trimmed.slice(0, shortHead)}…${trimmed.slice(-shortTail)}`;
  }
  return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`;
}

export function shouldTraceProviderAuth(
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return provider.trim().toLowerCase() === "xai" && env.OPENCLAW_DEBUG_XAI_AUTH === "1";
}

export function shouldLogProviderAuthSummaryOnce(provider: string, summaryKey: string): boolean {
  if (provider.trim().toLowerCase() !== "xai") {
    return false;
  }
  const key = `${provider.trim().toLowerCase()}:${summaryKey}`;
  if (loggedProviderAuthSummaries.has(key)) {
    return false;
  }
  loggedProviderAuthSummaries.add(key);
  return true;
}

export function summarizeProviderAuthKey(apiKey: string | undefined): string {
  const trimmed = apiKey?.trim() ?? "";
  if (!trimmed) {
    return "missing";
  }
  if (isNonSecretApiKeyMarker(trimmed)) {
    return `marker:${trimmed}`;
  }
  return formatApiKeyPreview(trimmed);
}
