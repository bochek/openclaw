import type { MiscMessageGenerationOptions } from "@whiskeysockets/baileys";

export type QuotedMessageKey = {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string;
};

// ── Inbound message metadata cache ──────────────────────────────────────
// Maps messageId → { participant, body } so the outbound adapter can
// populate the quote key with the sender JID and preview text even though
// the outbound path only receives a bare messageId string.

type QuotedMeta = { participant?: string; body?: string };
type CacheEntry = QuotedMeta & { ts: number };

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, CacheEntry>();

function makeCacheKey(accountId: string, remoteJid: string, messageId: string): string {
  return `${accountId}:${remoteJid}:${messageId}`;
}

export function cacheInboundMessageMeta(
  accountId: string,
  remoteJid: string,
  messageId: string,
  meta: QuotedMeta,
): void {
  if (!accountId || !messageId || !remoteJid) {
    return;
  }
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      cache.delete(oldest);
    }
  }
  cache.set(makeCacheKey(accountId, remoteJid, messageId), { ...meta, ts: Date.now() });
}

export function lookupInboundMessageMeta(
  accountId: string,
  remoteJid: string,
  messageId: string,
): QuotedMeta | undefined {
  const cacheKey = makeCacheKey(accountId, remoteJid, messageId);
  const entry = cache.get(cacheKey);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(cacheKey);
    return undefined;
  }
  return { participant: entry.participant, body: entry.body };
}

export function buildQuotedMessageOptions(params: {
  messageId?: string | null;
  remoteJid?: string | null;
  fromMe?: boolean;
  participant?: string;
  /** Original message text — shown in the quote preview bubble. */
  messageText?: string;
}): MiscMessageGenerationOptions | undefined {
  const id = params.messageId?.trim();
  const remoteJid = params.remoteJid?.trim();
  if (!id || !remoteJid) {
    return undefined;
  }
  return {
    quoted: {
      key: {
        remoteJid,
        id,
        fromMe: params.fromMe ?? false,
        participant: params.participant,
      },
      message: { conversation: params.messageText ?? "" },
    },
  } as MiscMessageGenerationOptions;
}
