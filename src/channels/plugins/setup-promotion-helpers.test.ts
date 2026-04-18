import { describe, expect, it, vi } from "vitest";

const { getBundledChannelPluginMock, getChannelPluginMock } = vi.hoisted(() => ({
  getBundledChannelPluginMock: vi.fn(),
  getChannelPluginMock: vi.fn(),
}));

vi.mock("./bundled.js", () => ({
  getBundledChannelPlugin: getBundledChannelPluginMock,
}));

vi.mock("./registry.js", () => ({
  getChannelPlugin: getChannelPluginMock,
}));

import { resolveSingleAccountKeysToMove } from "./setup-promotion-helpers.js";

describe("resolveSingleAccountKeysToMove", () => {
  it("keeps bundled static promotion keys off the plugin runtime path", () => {
    getBundledChannelPluginMock.mockImplementation(() => {
      throw new Error("should not load bundled channel runtime");
    });
    getChannelPluginMock.mockImplementation(() => {
      throw new Error("should not query channel registry");
    });

    const keys = resolveSingleAccountKeysToMove({
      channelKey: "whatsapp",
      channel: {
        dmPolicy: "allowlist",
        allowFrom: ["+15550001111"],
        groupPolicy: "open",
        groupAllowFrom: [],
        accounts: {
          work: {
            enabled: true,
            authDir: "/tmp/wa-work",
          },
        },
      },
    });

    expect(keys).toEqual(["dmPolicy", "allowFrom", "groupPolicy", "groupAllowFrom"]);
    expect(getChannelPluginMock).not.toHaveBeenCalled();
    expect(getBundledChannelPluginMock).not.toHaveBeenCalled();
  });

  it("uses bundled named-account fallbacks without loading setup surfaces", () => {
    getBundledChannelPluginMock.mockImplementation(() => {
      throw new Error("should not load bundled channel runtime");
    });
    getChannelPluginMock.mockImplementation(() => {
      throw new Error("should not query channel registry");
    });

    const keys = resolveSingleAccountKeysToMove({
      channelKey: "telegram",
      channel: {
        botToken: "telegram-test-token",
        tokenFile: "/tmp/telegram-token",
        streaming: true,
        accounts: {
          work: {
            botToken: "work-token",
          },
        },
      },
    });

    expect(keys).toEqual(["botToken", "tokenFile"]);
    expect(getChannelPluginMock).not.toHaveBeenCalled();
    expect(getBundledChannelPluginMock).not.toHaveBeenCalled();
  });
});
