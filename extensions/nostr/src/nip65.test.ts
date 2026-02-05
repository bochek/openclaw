import type { Filter } from "nostr-tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRelayCache,
  fetchDmInboxRelays,
  fetchRelayList,
  getRelaysForDm,
  sanitizeRelayUrls,
} from "./nip65.js";

interface SubscribeParams {
  onevent?: (event: import("nostr-tools").Event) => void;
  oneose?: () => void;
  onclose?: () => void;
}

class FakePool {
  public closeCount = 0;
  public destroyCount = 0;

  constructor(
    private readonly onSubscribe: (
      filter: Filter,
      params: SubscribeParams,
      close: () => void,
    ) => void,
  ) {}

  subscribeMany(_relays: string[], filter: Filter, params: SubscribeParams): { close: () => void } {
    const close = () => {
      this.closeCount += 1;
    };
    this.onSubscribe(filter, params, close);
    return { close };
  }

  destroy(): void {
    this.destroyCount += 1;
  }
}

const TEST_PUBKEY = "c220169537593d7126e9842f31a8d4d5fa66e271ce396f12ddc2d455db855bf2";

describe("sanitizeRelayUrls", () => {
  it("keeps valid public wss relays and deduplicates", () => {
    const result = sanitizeRelayUrls([
      "wss://relay.damus.io",
      "wss://relay.damus.io/",
      "wss://relay.primal.net?query=1",
      "wss://nos.lol#hash",
    ]);

    expect(result).toEqual(["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"]);
  });

  it("drops unsafe and invalid relays", () => {
    const result = sanitizeRelayUrls([
      "ws://relay.example.com",
      "https://relay.example.com",
      "wss://localhost:7447",
      "wss://127.0.0.1:7447",
      "wss://10.0.0.4:7447",
      "not-a-url",
      "wss://relay.example.com",
    ]);

    expect(result).toEqual(["wss://relay.example.com"]);
  });
});

describe("fetchDmInboxRelays", () => {
  beforeEach(() => {
    clearRelayCache();
  });

  it("parses kind:10050 relay tags and sanitizes output", async () => {
    const pool = new FakePool((_filter, params) => {
      setTimeout(() => {
        params.onevent?.({
          id: "x".repeat(64),
          kind: 10050,
          pubkey: TEST_PUBKEY,
          created_at: 1,
          tags: [
            ["relay", "wss://relay.example.com"],
            ["relay", "wss://relay.example.com/"],
            ["relay", "wss://localhost:7447"],
          ],
          content: "",
          sig: "y".repeat(128),
        } as import("nostr-tools").Event);
        params.oneose?.();
      }, 0);
    });

    const relays = await fetchDmInboxRelays(
      TEST_PUBKEY,
      pool as unknown as import("nostr-tools").SimplePool,
    );
    expect(relays).toEqual(["wss://relay.example.com"]);
  });

  it("closes subscriptions when discovery times out", async () => {
    vi.useFakeTimers();
    const pool = new FakePool(() => {
      // Intentionally do nothing so query timeout path is exercised.
    });

    const pending = fetchDmInboxRelays(
      TEST_PUBKEY,
      pool as unknown as import("nostr-tools").SimplePool,
    );

    vi.advanceTimersByTime(5000);
    await pending;
    expect(pool.closeCount).toBe(1);

    vi.useRealTimers();
  });
});

describe("fetchRelayList", () => {
  beforeEach(() => {
    clearRelayCache();
  });

  it("parses read/write relays from kind:10002 event and sanitizes", async () => {
    const pool = new FakePool((_filter, params) => {
      setTimeout(() => {
        params.onevent?.({
          id: "a".repeat(64),
          kind: 10002,
          pubkey: TEST_PUBKEY,
          created_at: 1,
          tags: [
            ["r", "wss://relay-read.example.com", "read"],
            ["r", "wss://relay-write.example.com", "write"],
            ["r", "wss://relay-both.example.com"],
            ["r", "wss://127.0.0.1:7447", "write"],
          ],
          content: "",
          sig: "b".repeat(128),
        } as import("nostr-tools").Event);
        params.oneose?.();
      }, 0);
    });

    const relayList = await fetchRelayList(
      TEST_PUBKEY,
      pool as unknown as import("nostr-tools").SimplePool,
    );
    expect(relayList.read).toEqual([
      "wss://relay-read.example.com",
      "wss://relay-both.example.com",
    ]);
    expect(relayList.write).toEqual([
      "wss://relay-write.example.com",
      "wss://relay-both.example.com",
    ]);
    expect(relayList.all).toEqual([
      "wss://relay-read.example.com",
      "wss://relay-write.example.com",
      "wss://relay-both.example.com",
    ]);
  });
});

describe("getRelaysForDm", () => {
  beforeEach(() => {
    clearRelayCache();
  });

  it("prefers DM inbox relays over write relays", async () => {
    const pool = new FakePool((filter, params) => {
      setTimeout(() => {
        if (filter.kinds?.includes(10050)) {
          params.onevent?.({
            id: "m".repeat(64),
            kind: 10050,
            pubkey: TEST_PUBKEY,
            created_at: 2,
            tags: [["relay", "wss://relay-dm.example.com"]],
            content: "",
            sig: "n".repeat(128),
          } as import("nostr-tools").Event);
        } else if (filter.kinds?.includes(10002)) {
          params.onevent?.({
            id: "o".repeat(64),
            kind: 10002,
            pubkey: TEST_PUBKEY,
            created_at: 1,
            tags: [["r", "wss://relay-write.example.com", "write"]],
            content: "",
            sig: "p".repeat(128),
          } as import("nostr-tools").Event);
        }
        params.oneose?.();
      }, 0);
    });

    const relays = await getRelaysForDm(
      TEST_PUBKEY,
      ["wss://relay-fallback.example.com"],
      pool as unknown as import("nostr-tools").SimplePool,
    );

    expect(relays).toEqual(["wss://relay-dm.example.com"]);
  });

  it("falls back to configured relays when discovered relays are unsafe", async () => {
    const pool = new FakePool((filter, params) => {
      setTimeout(() => {
        if (filter.kinds?.includes(10050)) {
          params.onevent?.({
            id: "q".repeat(64),
            kind: 10050,
            pubkey: TEST_PUBKEY,
            created_at: 2,
            tags: [["relay", "wss://localhost:7447"]],
            content: "",
            sig: "r".repeat(128),
          } as import("nostr-tools").Event);
        } else if (filter.kinds?.includes(10002)) {
          params.onevent?.({
            id: "s".repeat(64),
            kind: 10002,
            pubkey: TEST_PUBKEY,
            created_at: 1,
            tags: [["r", "wss://127.0.0.1:7447", "write"]],
            content: "",
            sig: "t".repeat(128),
          } as import("nostr-tools").Event);
        }
        params.oneose?.();
      }, 0);
    });

    const fallback = ["wss://relay-fallback.example.com"];
    const relays = await getRelaysForDm(
      TEST_PUBKEY,
      fallback,
      pool as unknown as import("nostr-tools").SimplePool,
    );
    expect(relays).toEqual(fallback);
  });
});
