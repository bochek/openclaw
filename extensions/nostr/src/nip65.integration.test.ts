import { describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "../../../src/infra/env.js";
import { fetchDmInboxRelays, fetchRelayList, getRelaysForDm } from "./nip65.js";

const LIVE =
  isTruthyEnvValue(process.env.NOSTR_LIVE_TEST) ||
  isTruthyEnvValue(process.env.LIVE) ||
  isTruthyEnvValue(process.env.OPENCLAW_LIVE_TEST);

const describeLive = LIVE ? describe : describe.skip;
const TEST_PUBKEY =
  process.env.NOSTR_LIVE_PUBKEY?.trim() ||
  "c220169537593d7126e9842f31a8d4d5fa66e271ce396f12ddc2d455db855bf2";

describeLive("NIP-65 live relay discovery", () => {
  it("queries public relays and returns sanitized relay lists", async () => {
    const dmInboxRelays = await fetchDmInboxRelays(TEST_PUBKEY);
    const relayList = await fetchRelayList(TEST_PUBKEY);
    const resolvedRelays = await getRelaysForDm(TEST_PUBKEY, ["wss://relay.damus.io"]);

    expect(Array.isArray(dmInboxRelays)).toBe(true);
    expect(Array.isArray(relayList.read)).toBe(true);
    expect(Array.isArray(relayList.write)).toBe(true);
    expect(Array.isArray(relayList.all)).toBe(true);
    expect(Array.isArray(resolvedRelays)).toBe(true);

    for (const relay of [
      ...dmInboxRelays,
      ...relayList.read,
      ...relayList.write,
      ...relayList.all,
      ...resolvedRelays,
    ]) {
      expect(relay.startsWith("wss://")).toBe(true);
      expect(relay.includes("localhost")).toBe(false);
      expect(relay.includes("127.0.0.1")).toBe(false);
    }
  }, 30_000);
});
