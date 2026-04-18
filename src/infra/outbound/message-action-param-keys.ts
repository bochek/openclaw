import { normalizeOptionalString } from "../../shared/string-coerce.js";

function toSnakeCaseKey(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function createStandardMessageActionParamKeys(keys: readonly string[]): Set<string> {
  const allKeys = new Set<string>();
  for (const key of keys) {
    allKeys.add(key);
    const snakeKey = toSnakeCaseKey(key);
    if (snakeKey !== key) {
      allKeys.add(snakeKey);
    }
  }
  return allKeys;
}

const STANDARD_MESSAGE_ACTION_PARAM_KEYS = createStandardMessageActionParamKeys([
  "accountId",
  "asDocument",
  "base64",
  "bestEffort",
  "blocks",
  "buttons",
  "caption",
  "card",
  "channel",
  "channelId",
  "components",
  "contentType",
  "dryRun",
  "filePath",
  "fileUrl",
  "filename",
  "forceDocument",
  "gifPlayback",
  "image",
  "interactive",
  "media",
  "mediaUrl",
  "message",
  "mimeType",
  "path",
  "pollAnonymous",
  "pollDurationHours",
  "pollDurationSeconds",
  "pollMulti",
  "pollOption",
  "pollPublic",
  "pollQuestion",
  "replyTo",
  "silent",
  "target",
  "targets",
  "text",
  "threadId",
  "to",
] as const);

export function hasPotentialPluginActionParam(params: Record<string, unknown>): boolean {
  return Object.entries(params).some(([key, value]) => {
    if (STANDARD_MESSAGE_ACTION_PARAM_KEYS.has(key)) {
      return false;
    }
    if (typeof value === "string") {
      return Boolean(normalizeOptionalString(value));
    }
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    return value !== undefined;
  });
}
