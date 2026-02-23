import { describe, expect, it, vi } from "vitest";
import type { MatrixAuth } from "../client.js";
import type { MatrixClient } from "../sdk.js";
import { registerMatrixMonitorEvents } from "./events.js";
import type { MatrixRawEvent } from "./types.js";
import { EventType } from "./types.js";

type RoomEventListener = (roomId: string, event: MatrixRawEvent) => void;

function createHarness(params?: {
  verifications?: Array<{
    id: string;
    transactionId?: string;
    otherUserId: string;
    phaseName: string;
    sas?: {
      decimal?: [number, number, number];
      emoji?: Array<[string, string]>;
    };
  }>;
}) {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const onRoomMessage = vi.fn(async () => {});
  const listVerifications = vi.fn(async () => params?.verifications ?? []);
  const client = {
    on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
      listeners.set(eventName, listener);
      return client;
    }),
    crypto: {
      listVerifications,
    },
  } as unknown as MatrixClient;

  registerMatrixMonitorEvents({
    client,
    auth: { encryption: true } as MatrixAuth,
    logVerboseMessage: vi.fn(),
    warnedEncryptedRooms: new Set<string>(),
    warnedCryptoMissingRooms: new Set<string>(),
    logger: { warn: vi.fn() },
    formatNativeDependencyHint: vi.fn(() => "install hint"),
    onRoomMessage,
  });

  const roomEventListener = listeners.get("room.event") as RoomEventListener | undefined;
  if (!roomEventListener) {
    throw new Error("room.event listener was not registered");
  }

  return {
    onRoomMessage,
    roomEventListener,
    listVerifications,
  };
}

describe("registerMatrixMonitorEvents verification routing", () => {
  it("routes verification request events into synthetic room messages", async () => {
    const { onRoomMessage, roomEventListener } = createHarness();
    roomEventListener("!room:example.org", {
      event_id: "$req1",
      sender: "@alice:example.org",
      type: EventType.RoomMessage,
      origin_server_ts: Date.now(),
      content: {
        msgtype: "m.key.verification.request",
        body: "verification request",
      },
    });

    await vi.waitFor(() => {
      expect(onRoomMessage).toHaveBeenCalledTimes(1);
    });
    const routed = onRoomMessage.mock.calls[0]?.[1] as MatrixRawEvent | undefined;
    expect(routed?.type).toBe(EventType.RoomMessage);
    expect((routed?.content as { body?: string }).body).toContain(
      "Matrix verification request received from @alice:example.org.",
    );
  });

  it("routes SAS emoji/decimal details when verification summaries expose them", async () => {
    const { onRoomMessage, roomEventListener } = createHarness({
      verifications: [
        {
          id: "verification-1",
          transactionId: "$req2",
          otherUserId: "@alice:example.org",
          phaseName: "started",
          sas: {
            decimal: [6158, 1986, 3513],
            emoji: [
              ["🎁", "Gift"],
              ["🌍", "Globe"],
              ["🐴", "Horse"],
            ],
          },
        },
      ],
    });

    roomEventListener("!room:example.org", {
      event_id: "$start2",
      sender: "@alice:example.org",
      type: "m.key.verification.start",
      origin_server_ts: Date.now(),
      content: {
        "m.relates_to": { event_id: "$req2" },
      },
    });

    await vi.waitFor(() => {
      const bodies = onRoomMessage.mock.calls.map(
        (call) => ((call[1] as MatrixRawEvent).content as { body?: string }).body ?? "",
      );
      expect(bodies.some((body) => body.includes("SAS emoji:"))).toBe(true);
      expect(bodies.some((body) => body.includes("SAS decimal: 6158 1986 3513"))).toBe(true);
    });
  });

  it("does not emit duplicate SAS notices for the same verification payload", async () => {
    const { onRoomMessage, roomEventListener } = createHarness({
      verifications: [
        {
          id: "verification-3",
          transactionId: "$req3",
          otherUserId: "@alice:example.org",
          phaseName: "started",
          sas: {
            decimal: [1111, 2222, 3333],
            emoji: [
              ["🚀", "Rocket"],
              ["🦋", "Butterfly"],
              ["📕", "Book"],
            ],
          },
        },
      ],
    });

    roomEventListener("!room:example.org", {
      event_id: "$start3",
      sender: "@alice:example.org",
      type: "m.key.verification.start",
      origin_server_ts: Date.now(),
      content: {
        "m.relates_to": { event_id: "$req3" },
      },
    });
    await vi.waitFor(() => {
      expect(onRoomMessage.mock.calls.length).toBeGreaterThan(0);
    });

    roomEventListener("!room:example.org", {
      event_id: "$key3",
      sender: "@alice:example.org",
      type: "m.key.verification.key",
      origin_server_ts: Date.now(),
      content: {
        "m.relates_to": { event_id: "$req3" },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const sasBodies = onRoomMessage.mock.calls
      .map((call) => ((call[1] as MatrixRawEvent).content as { body?: string }).body ?? "")
      .filter((body) => body.includes("SAS emoji:"));
    expect(sasBodies).toHaveLength(1);
  });
});
