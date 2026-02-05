import type { EventTemplate } from "nostr-tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    subscribeMany: vi.fn(),
    publish: vi.fn(),
    getRelaysForDm: vi.fn(),
    readNostrBusState: vi.fn(),
    writeNostrBusState: vi.fn(),
    computeSinceTimestamp: vi.fn(),
    readNostrProfileState: vi.fn(),
    writeNostrProfileState: vi.fn(),
    publishProfile: vi.fn(),
    getPublicKey: vi.fn(),
    finalizeEvent: vi.fn(),
    verifyEvent: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    createGiftWrap: vi.fn(),
    unwrapGiftWrap: vi.fn(),
  };
});

vi.mock("nostr-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nostr-tools")>();

  class MockSimplePool {
    subscribeMany = mocks.subscribeMany;
    publish = mocks.publish;
    destroy = vi.fn();
  }

  return {
    ...actual,
    SimplePool: MockSimplePool,
    getPublicKey: mocks.getPublicKey,
    finalizeEvent: mocks.finalizeEvent,
    verifyEvent: mocks.verifyEvent,
  };
});

vi.mock("nostr-tools/nip04", () => ({
  encrypt: mocks.encrypt,
  decrypt: mocks.decrypt,
}));

vi.mock("./nip17.js", () => ({
  createGiftWrap: mocks.createGiftWrap,
  unwrapGiftWrap: mocks.unwrapGiftWrap,
}));

vi.mock("./nip65.js", () => ({
  getRelaysForDm: mocks.getRelaysForDm,
}));

vi.mock("./nostr-state-store.js", () => ({
  readNostrBusState: mocks.readNostrBusState,
  writeNostrBusState: mocks.writeNostrBusState,
  computeSinceTimestamp: mocks.computeSinceTimestamp,
  readNostrProfileState: mocks.readNostrProfileState,
  writeNostrProfileState: mocks.writeNostrProfileState,
}));

vi.mock("./nostr-profile.js", () => ({
  publishProfile: mocks.publishProfile,
}));

import { startNostrBus } from "./nostr-bus.js";

const TEST_HEX_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const BOT_PUBKEY = "a".repeat(64);
const TARGET_PUBKEY = "b".repeat(64);

function makeSignedEvent(template: EventTemplate) {
  return {
    ...template,
    id: "c".repeat(64),
    pubkey: BOT_PUBKEY,
    sig: "d".repeat(128),
  };
}

describe("startNostrBus protocol flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getPublicKey.mockReturnValue(BOT_PUBKEY);
    mocks.verifyEvent.mockReturnValue(true);
    mocks.finalizeEvent.mockImplementation((template: EventTemplate) => makeSignedEvent(template));
    mocks.encrypt.mockReturnValue("ciphertext");
    mocks.decrypt.mockReturnValue("plaintext");
    mocks.createGiftWrap.mockImplementation((toPubkey: string, text: string) => ({
      event: {
        id: "e".repeat(64),
        kind: 1059,
        pubkey: "f".repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", toPubkey]],
        content: `wrapped:${text}`,
        sig: "1".repeat(128),
      },
      eventId: "e".repeat(64),
    }));
    mocks.unwrapGiftWrap.mockReturnValue(null);

    mocks.readNostrBusState.mockResolvedValue(null);
    mocks.writeNostrBusState.mockResolvedValue(undefined);
    mocks.computeSinceTimestamp.mockReturnValue(0);
    mocks.readNostrProfileState.mockResolvedValue(null);
    mocks.writeNostrProfileState.mockResolvedValue(undefined);
    mocks.publishProfile.mockResolvedValue({
      eventId: "p".repeat(64),
      createdAt: 1,
      successes: [],
      failures: [],
    });

    mocks.getRelaysForDm.mockImplementation(async (_pubkey: string, fallbackRelays: string[]) => {
      return fallbackRelays;
    });

    mocks.subscribeMany.mockImplementation(() => ({
      close: vi.fn(),
    }));
    mocks.publish.mockImplementation(() => [Promise.resolve("ok")]);
  });

  it("subscribes to both NIP-04 and NIP-17 inbound DM kinds", async () => {
    let capturedFilter: unknown;

    mocks.subscribeMany.mockImplementation((_relays: string[], filter: unknown) => {
      capturedFilter = filter;
      return { close: vi.fn() };
    });

    const bus = await startNostrBus({
      privateKey: TEST_HEX_KEY,
      relays: ["wss://relay.test"],
      onMessage: async () => {},
    });

    expect(capturedFilter).toEqual({
      kinds: [4, 1059],
      "#p": [BOT_PUBKEY],
      since: 0,
    });

    bus.close();
  });

  it("passes an auth signer to publish for auth-required relays", async () => {
    const authRelay = "wss://relay-auth.test";
    const signedAuthEvents: Array<ReturnType<typeof makeSignedEvent>> = [];

    mocks.getRelaysForDm.mockResolvedValue([authRelay]);
    mocks.publish.mockImplementation(
      (
        relays: string[],
        event: { kind: number; tags: string[][] },
        params: {
          onauth?: (template: EventTemplate) => Promise<ReturnType<typeof makeSignedEvent>>;
        },
      ) => {
        return [
          (async () => {
            expect(relays).toEqual([authRelay]);
            expect(event.kind).toBe(4);
            expect(params.onauth).toBeTypeOf("function");

            const signedAuthEvent = await params.onauth!({
              kind: 22242,
              created_at: 1,
              tags: [
                ["relay", authRelay],
                ["challenge", "challenge-token"],
              ],
              content: "",
            });
            signedAuthEvents.push(signedAuthEvent);
            return "ok";
          })(),
        ];
      },
    );

    const bus = await startNostrBus({
      privateKey: TEST_HEX_KEY,
      relays: ["wss://relay-configured.test"],
      dmProtocol: "nip04",
      onMessage: async () => {},
    });

    await bus.sendDm(TARGET_PUBKEY, "hello");

    expect(mocks.getRelaysForDm).toHaveBeenCalledWith(
      TARGET_PUBKEY,
      ["wss://relay-configured.test"],
      expect.anything(),
    );
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(signedAuthEvents).toHaveLength(1);
    expect(signedAuthEvents[0].kind).toBe(22242);
    expect(signedAuthEvents[0].pubkey).toBe(BOT_PUBKEY);
    expect(signedAuthEvents[0].id).toHaveLength(64);
    expect(signedAuthEvents[0].sig).toHaveLength(128);

    bus.close();
  });
});
