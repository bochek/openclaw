import type { ConfigUiHint } from "../config-ui-hints-types.js";
import { normalizeLowercaseStringOrEmpty } from "../string-coerce.js";
import sensitiveUrlConfigRules from "./sensitive-url-config-rules.json" with { type: "json" };

export const SENSITIVE_URL_HINT_TAG = "url-secret";
const SENSITIVE_URL_CONFIG_SUFFIXES = sensitiveUrlConfigRules.suffixes;
const SENSITIVE_URL_CONFIG_PATTERNS = sensitiveUrlConfigRules.patterns.map(
  (pattern) => new RegExp(pattern),
);

const SENSITIVE_URL_QUERY_PARAM_NAMES = new Set([
  "token",
  "key",
  "api_key",
  "apikey",
  "secret",
  "access_token",
  "password",
  "pass",
  "auth",
  "client_secret",
  "refresh_token",
]);

export function isSensitiveUrlQueryParamName(name: string): boolean {
  return SENSITIVE_URL_QUERY_PARAM_NAMES.has(normalizeLowercaseStringOrEmpty(name));
}

export function isSensitiveUrlConfigPath(path: string): boolean {
  for (const suffix of SENSITIVE_URL_CONFIG_SUFFIXES) {
    if (path.endsWith(suffix)) {
      return true;
    }
  }
  return SENSITIVE_URL_CONFIG_PATTERNS.some((pattern) => pattern.test(path));
}

export function hasSensitiveUrlHintTag(hint: Pick<ConfigUiHint, "tags"> | undefined): boolean {
  return hint?.tags?.includes(SENSITIVE_URL_HINT_TAG) === true;
}

export function redactSensitiveUrl(value: string): string {
  try {
    const parsed = new URL(value);
    let mutated = false;
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? "***" : "";
      parsed.password = parsed.password ? "***" : "";
      mutated = true;
    }
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (isSensitiveUrlQueryParamName(key)) {
        parsed.searchParams.set(key, "***");
        mutated = true;
      }
    }
    return mutated ? parsed.toString() : value;
  } catch {
    return value;
  }
}

export function redactSensitiveUrlLikeString(value: string): string {
  const redactedUrl = redactSensitiveUrl(value);
  if (redactedUrl !== value) {
    return redactedUrl;
  }
  return value
    .replace(/\/\/([^@/?#]+)@/, "//***:***@")
    .replace(/([?&])([^=&]+)=([^&]*)/g, (match, prefix: string, key: string) =>
      isSensitiveUrlQueryParamName(key) ? `${prefix}${key}=***` : match,
    );
}
