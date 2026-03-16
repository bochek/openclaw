import { describe, expect, it, vi } from "vitest";
import { createEmptyPluginRegistry, type PluginRecord } from "../../plugins/registry.js";
import { createExtensionHostPluginRegistrationActions } from "./plugin-registry-registrations.js";

function createRecord(): PluginRecord {
  return {
    id: "demo",
    name: "Demo",
    source: "/plugins/demo.ts",
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
  };
}

describe("extension host plugin registry registrations", () => {
  it("reports gateway-method collisions against core methods", () => {
    const registry = createEmptyPluginRegistry();
    const actions = createExtensionHostPluginRegistrationActions({
      registry,
      coreGatewayMethods: new Set(["ping"]),
    });

    actions.registerGatewayMethod(createRecord(), "ping", (() => {}) as never);

    expect(registry.gatewayHandlers.ping).toBeUndefined();
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        pluginId: "demo",
      }),
    );
  });

  it("reports invalid context-engine registrations through the host-owned action helper", () => {
    const registry = createEmptyPluginRegistry();
    const actions = createExtensionHostPluginRegistrationActions({
      registry,
      coreGatewayMethods: new Set(),
    });

    actions.registerContextEngine(createRecord(), "   ", (() => ({})) as never);

    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        pluginId: "demo",
        message: "context engine registration missing id",
      }),
    );
  });

  it("rejects legacy hook-name collisions", () => {
    const registry = createEmptyPluginRegistry();
    registry.hooks.push({
      pluginId: "existing",
      entry: {
        hook: {
          name: "shared-hook",
          description: "existing hook",
          source: "openclaw-plugin",
          pluginId: "existing",
          filePath: "/plugins/existing.ts",
          baseDir: "/plugins",
          handlerPath: "/plugins/existing.ts",
        },
        frontmatter: {},
        metadata: { events: ["message:received"] },
        invocation: { enabled: true },
      },
      events: ["message:received"],
      source: "/plugins/existing.ts",
    });
    const actions = createExtensionHostPluginRegistrationActions({
      registry,
      coreGatewayMethods: new Set(),
    });

    actions.registerHook(
      createRecord(),
      "message:received",
      vi.fn() as never,
      { name: "shared-hook" },
      {},
    );

    expect(registry.hooks).toHaveLength(1);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: "hook already registered: shared-hook (existing)",
      }),
    );
  });

  it("rejects cli registrations without explicit command metadata", () => {
    const registry = createEmptyPluginRegistry();
    const actions = createExtensionHostPluginRegistrationActions({
      registry,
      coreGatewayMethods: new Set(),
    });

    actions.registerCli(createRecord(), vi.fn() as never, undefined);

    expect(registry.cliRegistrars).toHaveLength(0);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: "cli registration missing explicit commands metadata",
      }),
    );
  });

  it("rejects cli command collisions", () => {
    const registry = createEmptyPluginRegistry();
    registry.cliRegistrars.push({
      pluginId: "existing",
      register: vi.fn(),
      commands: ["status"],
      source: "/plugins/existing.ts",
    });
    const actions = createExtensionHostPluginRegistrationActions({
      registry,
      coreGatewayMethods: new Set(),
    });

    actions.registerCli(createRecord(), vi.fn() as never, {
      commands: ["status", "other"],
    });

    expect(registry.cliRegistrars).toHaveLength(1);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: "cli command already registered: status (existing)",
      }),
    );
  });

  it("rejects duplicate service ids", () => {
    const registry = createEmptyPluginRegistry();
    registry.services.push({
      pluginId: "existing",
      service: {
        id: "shared-service",
        start: vi.fn(),
      },
      source: "/plugins/existing.ts",
    });
    const actions = createExtensionHostPluginRegistrationActions({
      registry,
      coreGatewayMethods: new Set(),
    });

    actions.registerService(createRecord(), {
      id: "shared-service",
      start: vi.fn(),
    });

    expect(registry.services).toHaveLength(1);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: "service already registered: shared-service (existing)",
      }),
    );
  });
});
