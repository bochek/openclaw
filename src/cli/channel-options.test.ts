import { afterEach, describe, expect, it, vi } from "vitest";
import { __testing, resolveCliChannelOptions } from "./channel-options.js";

const readFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("../channels/registry.js", () => ({
  CHAT_CHANNEL_ORDER: ["telegram", "discord"],
}));

describe("resolveCliChannelOptions", () => {
  afterEach(() => {
    __testing.resetPrecomputedChannelOptionsForTests();
    __testing.setReadStartupMetadataFileForTests();
    vi.clearAllMocks();
  });

  it("uses precomputed startup metadata when available", async () => {
    __testing.setReadStartupMetadataFileForTests(
      readFileSyncMock as typeof import("node:fs").readFileSync,
    );
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ channelOptions: ["cached", "telegram", "cached"] }),
    );

    expect(resolveCliChannelOptions()).toEqual(["cached", "telegram"]);
  });

  it("falls back to core channel order when metadata is missing", async () => {
    __testing.setReadStartupMetadataFileForTests(
      readFileSyncMock as typeof import("node:fs").readFileSync,
    );
    readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(resolveCliChannelOptions()).toEqual(["telegram", "discord"]);
  });

  it("ignores external catalog env during CLI bootstrap", async () => {
    process.env.OPENCLAW_PLUGIN_CATALOG_PATHS = "/tmp/plugins-catalog.json";
    __testing.setReadStartupMetadataFileForTests(
      readFileSyncMock as typeof import("node:fs").readFileSync,
    );
    readFileSyncMock.mockReturnValue(JSON.stringify({ channelOptions: ["cached", "telegram"] }));

    expect(resolveCliChannelOptions()).toEqual(["cached", "telegram"]);
    delete process.env.OPENCLAW_PLUGIN_CATALOG_PATHS;
  });
});
