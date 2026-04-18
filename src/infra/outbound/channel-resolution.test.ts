import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const resolveDefaultAgentIdMock = vi.hoisted(() => vi.fn());
const resolveAgentWorkspaceDirMock = vi.hoisted(() => vi.fn());
const getLoadedChannelPluginMock = vi.hoisted(() => vi.fn());
const getChannelPluginMock = vi.hoisted(() => vi.fn());
const applyPluginAutoEnableMock = vi.hoisted(() => vi.fn());
const resolveRuntimePluginRegistryMock = vi.hoisted(() => vi.fn());
const getActivePluginRegistryMock = vi.hoisted(() => vi.fn());
const getActivePluginChannelRegistryMock = vi.hoisted(() => vi.fn());
const getActivePluginChannelRegistryVersionMock = vi.hoisted(() => vi.fn());
const normalizeMessageChannelMock = vi.hoisted(() => vi.fn());
const isDeliverableMessageChannelMock = vi.hoisted(() => vi.fn());

vi.mock("../../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: (...args: unknown[]) => resolveDefaultAgentIdMock(...args),
  resolveAgentWorkspaceDir: (...args: unknown[]) => resolveAgentWorkspaceDirMock(...args),
}));

vi.mock("../../channels/plugins/index.js", () => ({
  getLoadedChannelPlugin: (...args: unknown[]) => getLoadedChannelPluginMock(...args),
  getChannelPlugin: (...args: unknown[]) => getChannelPluginMock(...args),
}));

vi.mock("../../config/plugin-auto-enable.js", () => ({
  applyPluginAutoEnable: (...args: unknown[]) => applyPluginAutoEnableMock(...args),
}));

vi.mock("../../plugins/loader.js", () => ({
  resolveRuntimePluginRegistry: (...args: unknown[]) => resolveRuntimePluginRegistryMock(...args),
}));

vi.mock("../../plugins/runtime.js", () => ({
  getActivePluginRegistry: (...args: unknown[]) => getActivePluginRegistryMock(...args),
  getActivePluginChannelRegistry: (...args: unknown[]) =>
    getActivePluginChannelRegistryMock(...args),
  getActivePluginChannelRegistryVersion: (...args: unknown[]) =>
    getActivePluginChannelRegistryVersionMock(...args),
}));

vi.mock("../../utils/message-channel.js", () => ({
  normalizeMessageChannel: (...args: unknown[]) => normalizeMessageChannelMock(...args),
  isDeliverableMessageChannel: (...args: unknown[]) => isDeliverableMessageChannelMock(...args),
}));

type ChannelResolutionModule = typeof import("./channel-resolution.js");

let channelResolution: ChannelResolutionModule;

function expectBootstrapArgs() {
  expect(resolveRuntimePluginRegistryMock).toHaveBeenCalledWith(
    expect.objectContaining({
      config: { autoEnabled: true },
      activationSourceConfig: { channels: {} },
      workspaceDir: "/tmp/workspace",
      runtimeOptions: {
        allowGatewaySubagentBinding: true,
      },
    }),
  );
}

describe("outbound channel resolution", () => {
  beforeAll(async () => {
    channelResolution = await import("./channel-resolution.js");
  });

  beforeEach(() => {
    resolveDefaultAgentIdMock.mockReset();
    resolveAgentWorkspaceDirMock.mockReset();
    getLoadedChannelPluginMock.mockReset();
    getChannelPluginMock.mockReset();
    applyPluginAutoEnableMock.mockReset();
    resolveRuntimePluginRegistryMock.mockReset();
    getActivePluginRegistryMock.mockReset();
    getActivePluginChannelRegistryMock.mockReset();
    getActivePluginChannelRegistryVersionMock.mockReset();
    normalizeMessageChannelMock.mockReset();
    isDeliverableMessageChannelMock.mockReset();

    normalizeMessageChannelMock.mockImplementation((value?: string | null) =>
      typeof value === "string" ? value.trim().toLowerCase() : undefined,
    );
    isDeliverableMessageChannelMock.mockImplementation((value?: string) =>
      ["telegram", "discord", "slack"].includes(String(value)),
    );
    getActivePluginRegistryMock.mockReturnValue({ channels: [] });
    getActivePluginChannelRegistryMock.mockReturnValue({ channels: [] });
    getActivePluginChannelRegistryVersionMock.mockReturnValue(1);
    applyPluginAutoEnableMock.mockReturnValue({
      config: { autoEnabled: true },
      autoEnabledReasons: {},
    });
    resolveDefaultAgentIdMock.mockReturnValue("main");
    resolveAgentWorkspaceDirMock.mockReturnValue("/tmp/workspace");
    channelResolution.resetOutboundChannelResolutionStateForTest();
  });

  it.each([
    { input: " Telegram ", expected: "telegram" },
    { input: "unknown", expected: undefined },
    { input: null, expected: undefined },
  ])("normalizes deliverable outbound channel for %j", ({ input, expected }) => {
    expect(channelResolution.normalizeDeliverableOutboundChannel(input)).toBe(expected);
  });

  it("returns the already-registered plugin without bootstrapping", () => {
    const plugin = { id: "telegram" };
    getLoadedChannelPluginMock.mockReturnValueOnce(plugin);

    expect(
      channelResolution.resolveOutboundChannelPlugin({
        channel: "telegram",
        cfg: {} as never,
      }),
    ).toBe(plugin);
    expect(resolveRuntimePluginRegistryMock).not.toHaveBeenCalled();
  });

  it("falls back to the active registry when getChannelPlugin misses", () => {
    const plugin = { id: "telegram" };
    getChannelPluginMock.mockReturnValue(undefined);
    getActivePluginRegistryMock.mockReturnValue({
      channels: [{ plugin }],
    });
    getActivePluginChannelRegistryMock.mockReturnValue({
      channels: [{ plugin }],
    });

    expect(
      channelResolution.resolveOutboundChannelPlugin({
        channel: "telegram",
        cfg: {} as never,
      }),
    ).toBe(plugin);
  });

  it("bootstraps plugins once per registry key and returns the newly loaded plugin", () => {
    const plugin = { id: "telegram" };
    getLoadedChannelPluginMock.mockReturnValueOnce(undefined).mockReturnValueOnce(plugin);

    expect(
      channelResolution.resolveOutboundChannelPlugin({
        channel: "telegram",
        cfg: { channels: {} } as never,
      }),
    ).toBe(plugin);
    expectBootstrapArgs();

    getChannelPluginMock.mockReturnValue(undefined);
    channelResolution.resolveOutboundChannelPlugin({
      channel: "telegram",
      cfg: { channels: {} } as never,
    });
    expect(resolveRuntimePluginRegistryMock).toHaveBeenCalledTimes(1);
    expectBootstrapArgs();
  });

  it("bootstraps when the active registry has other channels but not the requested one", () => {
    const plugin = { id: "telegram" };
    getLoadedChannelPluginMock.mockReturnValueOnce(undefined).mockReturnValueOnce(plugin);
    getActivePluginRegistryMock.mockReturnValue({
      channels: [{ plugin: { id: "discord" } }],
    });
    getActivePluginChannelRegistryMock.mockReturnValue({
      channels: [{ plugin: { id: "discord" } }],
    });

    expect(
      channelResolution.resolveOutboundChannelPlugin({
        channel: "telegram",
        cfg: { channels: {} } as never,
      }),
    ).toBe(plugin);
    expect(resolveRuntimePluginRegistryMock).toHaveBeenCalledTimes(1);
  });

  it("retries bootstrap after a transient load failure", () => {
    getChannelPluginMock.mockReturnValue(undefined);
    resolveRuntimePluginRegistryMock.mockImplementationOnce(() => {
      throw new Error("transient");
    });

    expect(
      channelResolution.resolveOutboundChannelPlugin({
        channel: "telegram",
        cfg: { channels: {} } as never,
      }),
    ).toBeUndefined();

    channelResolution.resolveOutboundChannelPlugin({
      channel: "telegram",
      cfg: { channels: {} } as never,
    });
    expect(resolveRuntimePluginRegistryMock).toHaveBeenCalledTimes(2);
  });

  it("retries bootstrap when the pinned channel registry version changes", () => {
    getChannelPluginMock.mockReturnValue(undefined);

    channelResolution.resolveOutboundChannelPlugin({
      channel: "telegram",
      cfg: { channels: {} } as never,
    });
    expect(resolveRuntimePluginRegistryMock).toHaveBeenCalledTimes(1);

    getActivePluginChannelRegistryVersionMock.mockReturnValue(2);
    channelResolution.resolveOutboundChannelPlugin({
      channel: "telegram",
      cfg: { channels: {} } as never,
    });
    expect(resolveRuntimePluginRegistryMock).toHaveBeenCalledTimes(2);
  });
});
