import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelOnboardingAdapter } from "./types.js";

const listChannelPluginsMock = vi.fn();

vi.mock("../../channels/plugins/index.js", () => ({
  listChannelPlugins: () => listChannelPluginsMock(),
}));

function createAdapter(channel: ChannelOnboardingAdapter["channel"]): ChannelOnboardingAdapter {
  return {
    channel,
    getStatus: async () => ({
      channel,
      configured: false,
      statusLines: [],
    }),
    configure: async (ctx) => ({ cfg: ctx.cfg }),
  };
}

describe("onboarding registry", () => {
  beforeEach(() => {
    listChannelPluginsMock.mockReset();
    listChannelPluginsMock.mockReturnValue([]);
  });

  it("falls back to built-in adapters when plugin registry is empty", async () => {
    const { getChannelOnboardingAdapter } = await import("./registry.js");
    expect(getChannelOnboardingAdapter("telegram")).toBeTruthy();
    expect(getChannelOnboardingAdapter("whatsapp")).toBeTruthy();
    expect(getChannelOnboardingAdapter("discord")).toBeTruthy();
    expect(getChannelOnboardingAdapter("slack")).toBeTruthy();
    expect(getChannelOnboardingAdapter("signal")).toBeTruthy();
    expect(getChannelOnboardingAdapter("imessage")).toBeTruthy();
  });

  it("prefers registry adapters over built-in fallback for the same channel", async () => {
    const customTelegramAdapter = createAdapter("telegram");
    listChannelPluginsMock.mockReturnValue([
      {
        id: "telegram",
        onboarding: customTelegramAdapter,
      },
    ]);
    const { getChannelOnboardingAdapter, listChannelOnboardingAdapters } =
      await import("./registry.js");

    expect(getChannelOnboardingAdapter("telegram")).toBe(customTelegramAdapter);
    expect(
      listChannelOnboardingAdapters().filter((adapter) => adapter.channel === "telegram"),
    ).toHaveLength(1);
  });
});
