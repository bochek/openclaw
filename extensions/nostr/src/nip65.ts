/**
 * NIP-65 Relay List Metadata + NIP-17 DM Inbox Relays
 *
 * Fetches recipient's preferred relays before sending DMs.
 *
 * Priority for DM delivery:
 * 1. kind:10050 — DM inbox relays (NIP-17 specific)
 * 2. kind:10002 — General relay list (write relays)
 * 3. Fallback to configured relays
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/65.md
 */

import { SimplePool, type Filter } from "nostr-tools";

// ============================================================================
// Constants
// ============================================================================

// Bootstrap relays for discovering user relay preferences
// Includes major relays + Primal's premium relay (where Primal publishes)
const BOOTSTRAP_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://premium.primal.net",
  "wss://purplepag.es",
];

// Cache TTL (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

// Query timeout
const QUERY_TIMEOUT_MS = 5000;

// ============================================================================
// Types
// ============================================================================

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

interface RelayList {
  /** Relays for reading (receiving messages) */
  read: string[];
  /** Relays for writing (publishing messages) */
  write: string[];
  /** All relays (read + write deduplicated) */
  all: string[];
}

function isIpv4Address(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a >= 224) {
    return true;
  }
  return false;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  if (normalized.includes(":")) {
    if (normalized === "::1") {
      return true;
    }
    if (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    ) {
      return true;
    }
    return false;
  }
  if (isIpv4Address(normalized)) {
    return isPrivateIpv4(normalized);
  }
  return false;
}

function normalizeRelayUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "wss:") {
      return null;
    }
    if (isPrivateOrLocalHost(parsed.hostname)) {
      return null;
    }

    // Normalize for dedupe: drop query/hash and trailing slash.
    parsed.search = "";
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return null;
  }
}

export function sanitizeRelayUrls(relays: string[]): string[] {
  const unique = new Set<string>();
  for (const relay of relays) {
    const normalized = normalizeRelayUrl(relay);
    if (!normalized) {
      continue;
    }
    unique.add(normalized);
  }
  return Array.from(unique);
}

function createScopedPool(pool?: SimplePool): { pool: SimplePool; ownsPool: boolean } {
  if (pool) {
    return { pool, ownsPool: false };
  }
  return { pool: new SimplePool(), ownsPool: true };
}

// ============================================================================
// Cache
// ============================================================================

const relayCache = new Map<string, CacheEntry<string[]>>();
const relayListCache = new Map<string, CacheEntry<RelayList>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

/**
 * Clear all relay caches (useful for testing)
 */
export function clearRelayCache(): void {
  relayCache.clear();
  relayListCache.clear();
}

// ============================================================================
// Relay Discovery
// ============================================================================

/**
 * Query relays for events matching a filter
 */
async function queryRelays(
  pool: SimplePool,
  relays: string[],
  filter: Filter,
  timeoutMs: number = QUERY_TIMEOUT_MS,
): Promise<import("nostr-tools").Event[]> {
  const events: import("nostr-tools").Event[] = [];

  return new Promise((resolve) => {
    let settled = false;
    let sub: { close: () => void } | null = null;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      sub?.close();
      resolve(events);
    };
    const timeout = setTimeout(finish, timeoutMs);

    try {
      sub = pool.subscribeMany(relays, filter, {
        onevent: (event: import("nostr-tools").Event) => {
          events.push(event);
        },
        oneose: finish,
        onclose: () => finish(),
      });
    } catch {
      finish();
    }
  });
}

/**
 * Fetch user's DM inbox relays (kind:10050)
 *
 * These are the relays where the user wants to receive DMs.
 *
 * @param pubkey - User's hex pubkey
 * @param pool - SimplePool instance (optional, creates one if not provided)
 * @returns Array of relay URLs
 */
export async function fetchDmInboxRelays(pubkey: string, pool?: SimplePool): Promise<string[]> {
  // Check cache
  const cacheKey = `dm:${pubkey}`;
  const cached = getCached(relayCache, cacheKey);
  if (cached) {
    return cached;
  }

  const { pool: usePool, ownsPool } = createScopedPool(pool);
  const relayCandidates: string[] = [];

  try {
    const events = await queryRelays(usePool, BOOTSTRAP_RELAYS, {
      kinds: [10050],
      authors: [pubkey],
      limit: 1,
    });

    if (events.length > 0) {
      // Sort by timestamp, get newest
      events.sort((a, b) => b.created_at - a.created_at);
      const event = events[0];

      // Extract relay URLs from 'relay' tags
      for (const tag of event.tags) {
        if (tag[0] === "relay" && typeof tag[1] === "string") {
          relayCandidates.push(tag[1]);
        }
      }
    }
  } catch {
    // Ignore errors, return empty
  } finally {
    if (ownsPool) {
      usePool.destroy();
    }
  }

  const relays = sanitizeRelayUrls(relayCandidates);

  // Cache result (even if empty)
  setCache(relayCache, cacheKey, relays);
  return relays;
}

/**
 * Fetch user's general relay list (kind:10002)
 *
 * @param pubkey - User's hex pubkey
 * @param pool - SimplePool instance (optional)
 * @returns Object with read, write, and all relay arrays
 */
export async function fetchRelayList(pubkey: string, pool?: SimplePool): Promise<RelayList> {
  // Check cache
  const cacheKey = `list:${pubkey}`;
  const cached = getCached(relayListCache, cacheKey);
  if (cached) {
    return cached;
  }

  const { pool: usePool, ownsPool } = createScopedPool(pool);
  const result: RelayList = { read: [], write: [], all: [] };
  const readSet = new Set<string>();
  const writeSet = new Set<string>();
  const allSet = new Set<string>();

  try {
    const events = await queryRelays(usePool, BOOTSTRAP_RELAYS, {
      kinds: [10002],
      authors: [pubkey],
      limit: 1,
    });

    if (events.length > 0) {
      // Sort by timestamp, get newest
      events.sort((a, b) => b.created_at - a.created_at);
      const event = events[0];

      for (const tag of event.tags) {
        if (tag[0] === "r" && typeof tag[1] === "string") {
          const url = normalizeRelayUrl(tag[1]);
          if (!url) {
            continue;
          }
          const marker = tag[2];

          if (marker === "read") {
            readSet.add(url);
          } else if (marker === "write") {
            writeSet.add(url);
          } else {
            // No marker = both read and write
            readSet.add(url);
            writeSet.add(url);
          }

          allSet.add(url);
        }
      }
    }
  } catch {
    // Ignore errors, return empty
  } finally {
    if (ownsPool) {
      usePool.destroy();
    }
  }

  result.read = Array.from(readSet);
  result.write = Array.from(writeSet);
  result.all = Array.from(allSet);

  // Cache result
  setCache(relayListCache, cacheKey, result);
  return result;
}

/**
 * Get optimal relays for sending a DM to a pubkey
 *
 * Priority:
 * 1. kind:10050 DM inbox relays (most specific)
 * 2. kind:10002 write relays (general preference)
 * 3. Fallback relays (configured defaults)
 *
 * @param recipientPubkey - Recipient's hex pubkey
 * @param fallbackRelays - Relays to use if discovery fails
 * @param pool - SimplePool instance (optional)
 * @returns Array of relay URLs to publish to
 */
export async function getRelaysForDm(
  recipientPubkey: string,
  fallbackRelays: string[],
  pool?: SimplePool,
): Promise<string[]> {
  // Try DM inbox first (most specific for NIP-17)
  const dmRelays = await fetchDmInboxRelays(recipientPubkey, pool);
  if (dmRelays.length > 0) {
    return dmRelays;
  }

  // Try general relay list (write relays)
  const relayList = await fetchRelayList(recipientPubkey, pool);
  if (relayList.write.length > 0) {
    return relayList.write;
  }

  // Fall back to configured relays
  return fallbackRelays;
}

/**
 * Get user's write relays (for fetching their events like kind:3)
 *
 * @param pubkey - User's hex pubkey
 * @param fallbackRelays - Relays to use if discovery fails
 * @param pool - SimplePool instance (optional)
 * @returns Array of relay URLs
 */
export async function getWriteRelays(
  pubkey: string,
  fallbackRelays: string[],
  pool?: SimplePool,
): Promise<string[]> {
  const relayList = await fetchRelayList(pubkey, pool);
  if (relayList.write.length > 0) {
    return relayList.write;
  }
  return fallbackRelays;
}
