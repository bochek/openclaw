import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry.js";

const loadOpenClawPluginsMock = vi.hoisted(() => vi.fn());
const getActivePluginRegistryMock = vi.hoisted(() => vi.fn());

vi.mock("../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDir: () => "/tmp/workspace",
  resolveDefaultAgentId: () => "default-agent",
}));

vi.mock("../config/config.js", () => ({
  loadConfig: () => ({}),
}));

vi.mock("../logging.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../plugins/loader.js", () => ({
  loadOpenClawPlugins: loadOpenClawPluginsMock,
}));

vi.mock("../plugins/runtime.js", () => ({
  getActivePluginRegistry: getActivePluginRegistryMock,
}));

describe("ensurePluginRegistryLoaded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("skips plugin loading when a provider-only registry is already active", async () => {
    const registry = createEmptyPluginRegistry();
    registry.providers.push({
      pluginId: "provider-demo",
      source: "test",
      provider: {
        id: "provider-demo",
        label: "Provider Demo",
        auth: [],
      },
    });
    getActivePluginRegistryMock.mockReturnValue(registry);

    const { ensurePluginRegistryLoaded } = await import("./plugin-registry.js");
    ensurePluginRegistryLoaded();

    expect(loadOpenClawPluginsMock).not.toHaveBeenCalled();
  });

  it("loads plugins once when the active registry is empty", async () => {
    getActivePluginRegistryMock.mockReturnValue(createEmptyPluginRegistry());

    const { ensurePluginRegistryLoaded } = await import("./plugin-registry.js");
    ensurePluginRegistryLoaded();
    ensurePluginRegistryLoaded();

    expect(loadOpenClawPluginsMock).toHaveBeenCalledTimes(1);
  });
});
