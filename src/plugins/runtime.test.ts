import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { telegramOutbound } from "../../test/channel-outbounds.js";
import type { OpenClawConfig } from "../config/config.js";
import { createOutboundTestPlugin, createTestRegistry } from "../test-utils/channel-plugins.js";
import { createEmptyPluginRegistry } from "./registry.js";
import type { PluginHttpRouteRegistration } from "./registry.js";
import {
  getActivePluginHttpRouteRegistryVersion,
  getActivePluginRegistryVersion,
  getActivePluginRegistry,
  pinActivePluginHttpRouteRegistry,
  releasePinnedPluginHttpRouteRegistry,
  resetPluginRuntimeStateForTest,
  resolveActivePluginHttpRouteRegistry,
  setActivePluginRegistry,
} from "./runtime.js";

function createRegistryWithRoute(path: string) {
  const registry = createEmptyPluginRegistry();
  registry.httpRoutes.push({
    path,
    auth: "plugin",
    match: path === "/plugins/diffs" ? "prefix" : "exact",
    handler: () => true,
    pluginId: path === "/plugins/diffs" ? "diffs" : "demo",
    source: "test",
  });
  return registry;
}

function createRuntimeRegistryPair() {
  return {
    startupRegistry: createEmptyPluginRegistry(),
    laterRegistry: createEmptyPluginRegistry(),
  };
}

function expectRegistryVersions(params: { active: number; routes: number }) {
  expect(getActivePluginRegistryVersion()).toBe(params.active);
  expect(getActivePluginHttpRouteRegistryVersion()).toBe(params.routes);
}

function expectActiveRouteRegistryResolution(params: {
  pinnedRegistry: ReturnType<typeof createEmptyPluginRegistry>;
  explicitRegistry: ReturnType<typeof createEmptyPluginRegistry>;
  expectedRegistry: "pinned" | "explicit";
}) {
  setActivePluginRegistry(params.pinnedRegistry);
  pinActivePluginHttpRouteRegistry(params.pinnedRegistry);

  expect(resolveActivePluginHttpRouteRegistry(params.explicitRegistry)).toBe(
    params.expectedRegistry === "pinned" ? params.pinnedRegistry : params.explicitRegistry,
  );
}

function expectPinnedRouteRegistry(
  startupRegistry: ReturnType<typeof createEmptyPluginRegistry>,
  laterRegistry: ReturnType<typeof createEmptyPluginRegistry>,
) {
  setActivePluginRegistry(startupRegistry);
  pinActivePluginHttpRouteRegistry(startupRegistry);
  setActivePluginRegistry(laterRegistry);
  expect(resolveActivePluginHttpRouteRegistry(laterRegistry)).toBe(startupRegistry);
}

function expectRouteRegistryState(params: { setup: () => void; assert: () => void }) {
  params.setup();
  params.assert();
}

describe("plugin runtime route registry", () => {
  afterEach(() => {
    releasePinnedPluginHttpRouteRegistry();
    resetPluginRuntimeStateForTest();
  });

  it("stays empty until a caller explicitly installs or requires a registry", () => {
    resetPluginRuntimeStateForTest();

    expect(getActivePluginRegistry()).toBeNull();
  });

  it.each([
    {
      name: "keeps the pinned route registry when the active plugin registry changes",
      run: () => {
        const { startupRegistry, laterRegistry } = createRuntimeRegistryPair();
        expectPinnedRouteRegistry(startupRegistry, laterRegistry);
      },
    },
    {
      name: "tracks route registry repins separately from the active registry version",
      run: () => {
        const { startupRegistry, laterRegistry } = createRuntimeRegistryPair();
        const repinnedRegistry = createEmptyPluginRegistry();

        setActivePluginRegistry(startupRegistry);
        pinActivePluginHttpRouteRegistry(laterRegistry);

        const activeVersionBeforeRepin = getActivePluginRegistryVersion();
        const routeVersionBeforeRepin = getActivePluginHttpRouteRegistryVersion();

        pinActivePluginHttpRouteRegistry(repinnedRegistry);

        expectRegistryVersions({
          active: activeVersionBeforeRepin,
          routes: routeVersionBeforeRepin + 1,
        });
      },
    },
  ] as const)("$name", ({ run }) => {
    expectRouteRegistryState({
      setup: () => {},
      assert: run,
    });
  });

  it.each([
    {
      name: "falls back to the provided registry when the pinned route registry has no routes",
      pinnedRegistry: createEmptyPluginRegistry(),
      explicitRegistry: createRegistryWithRoute("/demo"),
      expected: "explicit",
    },
    {
      name: "prefers the pinned route registry when it already owns routes",
      pinnedRegistry: createRegistryWithRoute("/bluebubbles-webhook"),
      explicitRegistry: createRegistryWithRoute("/plugins/diffs"),
      expected: "pinned",
    },
  ] as const)("$name", ({ pinnedRegistry, explicitRegistry, expected }) => {
    expectActiveRouteRegistryResolution({
      pinnedRegistry,
      explicitRegistry,
      expectedRegistry: expected,
    });
  });

  it("keeps the shared runtime registry coherent across resetModules", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    vi.resetModules();
    const [{ deliverOutboundPayloads }, runtime] = await Promise.all([
      import("../infra/outbound/deliver.js"),
      import("./runtime.js"),
    ]);
    const registry = createTestRegistry([
      {
        pluginId: "telegram",
        plugin: createOutboundTestPlugin({ id: "telegram", outbound: telegramOutbound }),
        source: "test",
      },
    ]);
    runtime.setActivePluginRegistry(registry);

    const cfg: OpenClawConfig = {
      channels: { telegram: { botToken: "tok-1", textChunkLimit: 2 } },
    };
    await deliverOutboundPayloads({
      cfg,
      channel: "telegram",
      to: "123",
      payloads: [{ text: "abcd" }],
      deps: { sendTelegram },
    });

    expect(sendTelegram).toHaveBeenCalledTimes(2);
    expect(runtime.getActivePluginRegistry()).toBe(runtime.getActivePluginChannelRegistry());
  });
});

const makeRoute = (path: string): PluginHttpRouteRegistration => ({
  path,
  handler: () => {},
  auth: "gateway",
  match: "exact",
});

describe("setActivePluginRegistry", () => {
  beforeEach(() => {
    resetPluginRuntimeStateForTest();
    setActivePluginRegistry(createEmptyPluginRegistry());
  });

  it("does not carry forward httpRoutes when new registry has none", () => {
    const oldRegistry = createEmptyPluginRegistry();
    const fakeRoute = makeRoute("/test");
    oldRegistry.httpRoutes.push(fakeRoute);
    setActivePluginRegistry(oldRegistry);
    expect(getActivePluginRegistry()?.httpRoutes).toHaveLength(1);

    const newRegistry = createEmptyPluginRegistry();
    expect(newRegistry.httpRoutes).toHaveLength(0);
    setActivePluginRegistry(newRegistry);
    expect(getActivePluginRegistry()?.httpRoutes).toHaveLength(0);
  });

  it("does not carry forward when new registry already has routes", () => {
    const oldRegistry = createEmptyPluginRegistry();
    oldRegistry.httpRoutes.push(makeRoute("/old"));
    setActivePluginRegistry(oldRegistry);

    const newRegistry = createEmptyPluginRegistry();
    const newRoute = makeRoute("/new");
    newRegistry.httpRoutes.push(newRoute);
    setActivePluginRegistry(newRegistry);
    expect(getActivePluginRegistry()?.httpRoutes).toHaveLength(1);
    expect(getActivePluginRegistry()?.httpRoutes[0]).toEqual(newRoute);
  });

  it("does not carry forward when same registry is set again", () => {
    const registry = createEmptyPluginRegistry();
    registry.httpRoutes.push(makeRoute("/test"));
    setActivePluginRegistry(registry);
    setActivePluginRegistry(registry);
    expect(getActivePluginRegistry()?.httpRoutes).toHaveLength(1);
  });
});
