import { beforeEach, describe, expect, it } from "vitest";
import { getGlobalHookRunner, resetGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import { activateExtensionHostRegistry } from "./activation.js";
import {
  getActiveExtensionHostRegistry,
  getActiveExtensionHostRegistryKey,
} from "./static/active-registry.js";

describe("extension host activation", () => {
  beforeEach(() => {
    resetGlobalHookRunner();
  });

  it("activates the registry through the host boundary", () => {
    const registry = createEmptyPluginRegistry();
    registry.plugins.push({
      id: "activation-test",
      name: "activation-test",
      source: "test",
      origin: "workspace",
      enabled: true,
      status: "loaded",
      toolNames: [],
      hookNames: [],
      channelIds: [],
      providerIds: [],
      gatewayMethods: [],
      cliCommands: [],
      services: [],
      commands: [],
      httpRoutes: 0,
      hookCount: 0,
      configSchema: false,
    });

    activateExtensionHostRegistry(registry, "activation-key");

    expect(getActiveExtensionHostRegistry()).toBe(registry);
    expect(getActiveExtensionHostRegistryKey()).toBe("activation-key");
    expect(getGlobalHookRunner()).toBeDefined();
  });
});
