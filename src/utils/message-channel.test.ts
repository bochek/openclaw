import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import { addExtensionHostChannelRegistration } from "../extension-host/runtime-registry.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createMSTeamsTestPluginBase, createTestRegistry } from "../test-utils/channel-plugins.js";
import { resolveGatewayMessageChannel } from "./message-channel.js";

const emptyRegistry = createTestRegistry([]);
const msteamsPlugin: ChannelPlugin = {
  ...createMSTeamsTestPluginBase(),
};

describe("message-channel", () => {
  beforeEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("normalizes gateway message channels and rejects unknown values", () => {
    expect(resolveGatewayMessageChannel("discord")).toBe("discord");
    expect(resolveGatewayMessageChannel(" imsg ")).toBe("imessage");
    expect(resolveGatewayMessageChannel("web")).toBeUndefined();
    expect(resolveGatewayMessageChannel("nope")).toBeUndefined();
  });

  it("normalizes plugin aliases when registered", () => {
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "msteams", plugin: msteamsPlugin, source: "test" }]),
    );
    expect(resolveGatewayMessageChannel("teams")).toBe("msteams");
  });

  it("falls back to host-owned channel state when the legacy channel array is replaced", () => {
    const registry = createTestRegistry([
      { pluginId: "msteams", plugin: msteamsPlugin, source: "test" },
    ]);
    setActivePluginRegistry(registry, "message-channel-registry");
    expect(resolveGatewayMessageChannel("teams")).toBe("msteams");

    registry.channels = [] as typeof registry.channels;
    addExtensionHostChannelRegistration(registry, {
      pluginId: "msteams",
      plugin: msteamsPlugin,
      source: "test",
    });
    setActivePluginRegistry(registry, "message-channel-registry");

    expect(resolveGatewayMessageChannel("teams")).toBe("msteams");
  });
});
