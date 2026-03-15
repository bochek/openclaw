import { describe, expect, it, vi } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import {
  getExtensionHostGatewayHandlers,
  hasExtensionHostRuntimeEntries,
  listExtensionHostCliRegistrations,
  listExtensionHostHttpRoutes,
  listExtensionHostProviderRegistrations,
  listExtensionHostServiceRegistrations,
  listExtensionHostToolRegistrations,
} from "./runtime-registry.js";

describe("extension host runtime registry accessors", () => {
  it("detects runtime entries across non-tool surfaces", () => {
    const providerRegistry = createEmptyPluginRegistry();
    providerRegistry.providers.push({
      pluginId: "provider-demo",
      source: "test",
      provider: {
        id: "provider-demo",
        label: "Provider Demo",
        auth: [],
      },
    });
    expect(hasExtensionHostRuntimeEntries(providerRegistry)).toBe(true);

    const routeRegistry = createEmptyPluginRegistry();
    routeRegistry.httpRoutes.push({
      path: "/plugins/demo",
      handler: vi.fn(),
      auth: "plugin",
      match: "exact",
      pluginId: "route-demo",
      source: "test",
    });
    expect(hasExtensionHostRuntimeEntries(routeRegistry)).toBe(true);

    const gatewayRegistry = createEmptyPluginRegistry();
    gatewayRegistry.gatewayHandlers["demo.echo"] = vi.fn();
    expect(hasExtensionHostRuntimeEntries(gatewayRegistry)).toBe(true);
  });

  it("returns stable empty views for missing registries", () => {
    expect(hasExtensionHostRuntimeEntries(null)).toBe(false);
    expect(listExtensionHostProviderRegistrations(null)).toEqual([]);
    expect(listExtensionHostToolRegistrations(null)).toEqual([]);
    expect(listExtensionHostServiceRegistrations(null)).toEqual([]);
    expect(listExtensionHostCliRegistrations(null)).toEqual([]);
    expect(listExtensionHostHttpRoutes(null)).toEqual([]);
    expect(getExtensionHostGatewayHandlers(null)).toEqual({});
  });

  it("projects existing registry collections without copying them", () => {
    const registry = createEmptyPluginRegistry();
    registry.tools.push({
      pluginId: "tool-demo",
      optional: false,
      source: "test",
      names: ["tool_demo"],
      factory: () => ({
        name: "tool_demo",
        description: "tool demo",
        parameters: { type: "object", properties: {} },
        async execute() {
          return { content: [{ type: "text", text: "ok" }] };
        },
      }),
    });
    registry.services.push({
      pluginId: "svc-demo",
      source: "test",
      service: {
        id: "svc-demo",
        start: () => undefined,
      },
    });
    registry.cliRegistrars.push({
      pluginId: "cli-demo",
      source: "test",
      commands: ["demo"],
      register: () => undefined,
    });
    registry.httpRoutes.push({
      path: "/plugins/demo",
      handler: vi.fn(),
      auth: "plugin",
      match: "exact",
      pluginId: "route-demo",
      source: "test",
    });
    registry.gatewayHandlers["demo.echo"] = vi.fn();

    expect(listExtensionHostToolRegistrations(registry)).toBe(registry.tools);
    expect(listExtensionHostServiceRegistrations(registry)).toBe(registry.services);
    expect(listExtensionHostCliRegistrations(registry)).toBe(registry.cliRegistrars);
    expect(listExtensionHostHttpRoutes(registry)).toBe(registry.httpRoutes);
    expect(getExtensionHostGatewayHandlers(registry)).toBe(registry.gatewayHandlers);
  });
});
