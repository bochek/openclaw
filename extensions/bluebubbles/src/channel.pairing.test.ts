import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "./runtime-api.js";
import { __testing as channelTesting, bluebubblesPlugin } from "./channel.js";

const sendMessageBlueBubblesMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/channels/plugins/bundled.js", () => ({
  bundledChannelPlugins: [],
  bundledChannelSetupPlugins: [],
}));

describe("bluebubblesPlugin.pairing.notifyApproval", () => {
  beforeEach(() => {
    channelTesting.setLoadBlueBubblesChannelRuntimeForTest(
      async () =>
        ({
          sendMessageBlueBubbles: sendMessageBlueBubblesMock,
        }) as never,
    );
    sendMessageBlueBubblesMock.mockReset();
    sendMessageBlueBubblesMock.mockResolvedValue({ messageId: "bb-pairing" });
  });

  it("preserves accountId when sending pairing approvals", async () => {
    const cfg = {
      channels: {
        bluebubbles: {
          accounts: {
            work: {
              serverUrl: "http://localhost:1234",
              password: "test-password",
            },
          },
        },
      },
    } as OpenClawConfig;

    await bluebubblesPlugin.pairing?.notifyApproval?.({
      cfg,
      id: "+15551234567",
      accountId: "work",
    });

    expect(sendMessageBlueBubblesMock).toHaveBeenCalledWith(
      "+15551234567",
      expect.any(String),
      expect.objectContaining({
        cfg,
        accountId: "work",
      }),
    );
  });
});
