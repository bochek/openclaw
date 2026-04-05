import { describe, expect, it, vi } from "vitest";
import { isChannelConfigured } from "./channel-configured.js";

vi.mock("../channels/plugins/bootstrap-registry.js", async () => {
  const actual = await vi.importActual<typeof import("../channels/plugins/bootstrap-registry.js")>(
    "../channels/plugins/bootstrap-registry.js",
  );
  return {
    ...actual,
    getBootstrapChannelPlugin: vi.fn(actual.getBootstrapChannelPlugin),
  };
});

async function getBootstrapRegistryMock() {
  const module = await import("../channels/plugins/bootstrap-registry.js");
  return vi.mocked(module.getBootstrapChannelPlugin);
}

describe("isChannelConfigured", () => {
  it("detects Telegram env configuration through the channel plugin seam", () => {
    expect(isChannelConfigured({}, "telegram", { TELEGRAM_BOT_TOKEN: "token" })).toBe(true);
  });

  it("detects Discord env configuration through the channel plugin seam", () => {
    expect(isChannelConfigured({}, "discord", { DISCORD_BOT_TOKEN: "token" })).toBe(true);
  });

  it("detects Slack env configuration through the channel plugin seam", () => {
    expect(isChannelConfigured({}, "slack", { SLACK_BOT_TOKEN: "xoxb-test" })).toBe(true);
  });

  it("requires both IRC host and nick env vars through the channel plugin seam", () => {
    expect(isChannelConfigured({}, "irc", { IRC_HOST: "irc.example.com" })).toBe(false);
    expect(
      isChannelConfigured({}, "irc", {
        IRC_HOST: "irc.example.com",
        IRC_NICK: "openclaw",
      }),
    ).toBe(true);
  });

  it("still falls back to generic config presence for channels without a custom hook", () => {
    expect(
      isChannelConfigured(
        {
          channels: {
            signal: {
              httpPort: 8080,
            },
          },
        },
        "signal",
        {},
      ),
    ).toBe(true);
  });

  it("falls back to generic config presence when bootstrap registry loading throws", async () => {
    const getBootstrapChannelPlugin = await getBootstrapRegistryMock();
    getBootstrapChannelPlugin.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(
      isChannelConfigured(
        {
          channels: {
            signal: {
              httpPort: 8080,
            },
          },
        },
        "signal",
        {},
      ),
    ).toBe(true);
  });
});
