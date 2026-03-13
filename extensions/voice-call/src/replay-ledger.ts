import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ProviderName, WebhookContext } from "./types.js";

const REPLAY_LEDGER_FILE = "webhook-replay.jsonl";

type ReplayLedgerRecord = {
  key: string;
  expiresAt: number;
};

export function buildWebhookReplayKey(params: {
  provider: ProviderName;
  ctx: WebhookContext;
}): string {
  const url = new URL(params.ctx.url);
  const sortedQuery = Array.from(url.searchParams.entries())
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey === bKey) {
        return aValue.localeCompare(bValue);
      }
      return aKey.localeCompare(bKey);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = crypto
    .createHash("sha256")
    .update(params.provider)
    .update("\n")
    .update(params.ctx.method)
    .update("\n")
    .update(url.pathname)
    .update("\n")
    .update(sortedQuery)
    .update("\n")
    .update(params.ctx.rawBody)
    .digest("hex");
  return `${params.provider}:${digest}`;
}

export function loadReplayLedger(storePath: string, now = Date.now()): Map<string, number> {
  const logPath = path.join(storePath, REPLAY_LEDGER_FILE);
  if (!fs.existsSync(logPath)) {
    return new Map();
  }

  const ledger = new Map<string, number>();
  const lines = fs.readFileSync(logPath, "utf-8").split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      const record = JSON.parse(line) as ReplayLedgerRecord;
      if (
        typeof record.key !== "string" ||
        !record.key ||
        typeof record.expiresAt !== "number" ||
        !Number.isFinite(record.expiresAt) ||
        record.expiresAt <= now
      ) {
        continue;
      }
      ledger.set(record.key, record.expiresAt);
    } catch {
      // Ignore malformed lines.
    }
  }

  return ledger;
}

export function pruneReplayLedger(ledger: Map<string, number>, now = Date.now()): void {
  for (const [key, expiresAt] of ledger) {
    if (expiresAt <= now) {
      ledger.delete(key);
    }
  }
}

export function persistReplayLedgerEntry(
  storePath: string,
  params: { key: string; expiresAt: number },
): void {
  const logPath = path.join(storePath, REPLAY_LEDGER_FILE);
  const line = `${JSON.stringify(params)}\n`;
  try {
    fs.appendFileSync(logPath, line);
  } catch (err) {
    console.error("[voice-call] Failed to persist replay ledger entry:", err);
  }
}
