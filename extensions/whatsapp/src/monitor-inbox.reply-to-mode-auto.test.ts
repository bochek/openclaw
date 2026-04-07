import "./monitor-inbox.test-harness.js";
import { describe, expect, it, vi } from "vitest";
import {
  buildNotifyMessageUpsert,
  installWebMonitorInboxUnitTestHooks,
  startInboxMonitor,
  waitForMessageCalls,
} from "./monitor-inbox.test-harness.js";

describe("monitorWebInbox auto replyToMode plumbing", () => {
  installWebMonitorInboxUnitTestHooks();

  it("marks debounced inbound batches as queued for auto reply threading", async () => {
    vi.useFakeTimers();
    const onMessage = vi.fn(async () => {});
    const { listener, sock } = await startInboxMonitor(onMessage, { debounceMs: 25 });

    sock.ev.emit(
      "messages.upsert",
      buildNotifyMessageUpsert({
        id: "msg-1",
        remoteJid: "1555@s.whatsapp.net",
        text: "first",
        timestamp: Math.floor(Date.now() / 1000),
        pushName: "Tester",
      }),
    );
    sock.ev.emit(
      "messages.upsert",
      buildNotifyMessageUpsert({
        id: "msg-2",
        remoteJid: "1555@s.whatsapp.net",
        text: "second",
        timestamp: Math.floor(Date.now() / 1000),
        pushName: "Tester",
      }),
    );

    await vi.advanceTimersByTimeAsync(30);
    await waitForMessageCalls(onMessage, 1);

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "msg-2",
        body: "first\nsecond",
        wasQueued: true,
      }),
    );

    vi.useRealTimers();
    await listener.close();
  });
});
