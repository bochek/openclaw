import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  state: {
    tools: [
      { name: "exec", label: "Exec", description: "Run shell commands" },
      { name: "docs_lookup", label: "Docs Lookup", description: "Search docs" },
    ] as Array<{
      name: string;
      label?: string;
      description?: string;
      displaySummary?: string;
    }>,
    pluginMeta: {} as Record<string, { pluginId: string } | undefined>,
    channelMeta: {} as Record<string, { channelId: string } | undefined>,
    effectivePolicy: {} as { profile?: string; providerProfile?: string },
    resolvedModelCompat: undefined as Record<string, unknown> | undefined,
  },
  createToolsMock: vi.fn(),
  resolveModelMock: vi.fn(),
}));

vi.mock("./agent-scope.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agent-scope.js")>();
  return {
    ...actual,
    resolveSessionAgentId: () => "main",
    resolveAgentWorkspaceDir: () => "/tmp/workspace-main",
    resolveAgentDir: () => "/tmp/agents/main/agent",
  };
});

vi.mock("./pi-tools.js", () => ({
  createOpenClawCodingTools: hoisted.createToolsMock,
}));

vi.mock("./pi-embedded-runner/model.js", () => ({
  resolveModel: hoisted.resolveModelMock,
}));

vi.mock("../plugins/tools.js", () => ({
  getPluginToolMeta: (tool: { name: string }) => hoisted.state.pluginMeta[tool.name],
}));

vi.mock("./channel-tools.js", () => ({
  getChannelAgentToolMeta: (tool: { name: string }) => hoisted.state.channelMeta[tool.name],
}));

vi.mock("./pi-tools.policy.js", () => ({
  resolveEffectiveToolPolicy: () => hoisted.state.effectivePolicy,
}));

let resolveEffectiveToolInventory: typeof import("./tools-effective-inventory.js").resolveEffectiveToolInventory;

async function loadHarness(options?: {
  tools?: Array<{ name: string; label?: string; description?: string; displaySummary?: string }>;
  createToolsMock?: ReturnType<typeof vi.fn>;
  pluginMeta?: Record<string, { pluginId: string } | undefined>;
  channelMeta?: Record<string, { channelId: string } | undefined>;
  effectivePolicy?: { profile?: string; providerProfile?: string };
  resolvedModelCompat?: Record<string, unknown>;
}) {
  hoisted.state.tools =
    options?.tools ?? [
      { name: "exec", label: "Exec", description: "Run shell commands" },
      { name: "docs_lookup", label: "Docs Lookup", description: "Search docs" },
    ];
  hoisted.state.pluginMeta = options?.pluginMeta ?? {};
  hoisted.state.channelMeta = options?.channelMeta ?? {};
  hoisted.state.effectivePolicy = options?.effectivePolicy ?? {};
  hoisted.state.resolvedModelCompat = options?.resolvedModelCompat;
  hoisted.createToolsMock.mockImplementation(
    options?.createToolsMock ?? (() => hoisted.state.tools),
  );
  hoisted.resolveModelMock.mockReturnValue({
    model: hoisted.state.resolvedModelCompat
      ? { compat: hoisted.state.resolvedModelCompat }
      : undefined,
    authStorage: {} as never,
    modelRegistry: {} as never,
  });
  return { resolveEffectiveToolInventory };
}

beforeAll(async () => {
  ({ resolveEffectiveToolInventory } = await import("./tools-effective-inventory.js"));
});

beforeEach(() => {
  hoisted.state.tools = [
    { name: "exec", label: "Exec", description: "Run shell commands" },
    { name: "docs_lookup", label: "Docs Lookup", description: "Search docs" },
  ];
  hoisted.state.pluginMeta = {};
  hoisted.state.channelMeta = {};
  hoisted.state.effectivePolicy = {};
  hoisted.state.resolvedModelCompat = undefined;
  hoisted.createToolsMock.mockReset();
  hoisted.resolveModelMock.mockReset();
});

describe("resolveEffectiveToolInventory", () => {
  it("groups core, plugin, and channel tools from the effective runtime set", async () => {
    const { resolveEffectiveToolInventory } = await loadHarness({
      tools: [
        { name: "exec", label: "Exec", description: "Run shell commands" },
        { name: "docs_lookup", label: "Docs Lookup", description: "Search docs" },
        { name: "message_actions", label: "Message Actions", description: "Act on messages" },
      ],
      pluginMeta: { docs_lookup: { pluginId: "docs" } },
      channelMeta: { message_actions: { channelId: "telegram" } },
    });

    const result = resolveEffectiveToolInventory({ cfg: {} });

    expect(result).toEqual({
      agentId: "main",
      profile: "full",
      groups: [
        {
          id: "core",
          label: "Built-in tools",
          source: "core",
          tools: [
            {
              id: "exec",
              label: "Exec",
              description: "Run shell commands",
              rawDescription: "Run shell commands",
              source: "core",
            },
          ],
        },
        {
          id: "plugin",
          label: "Connected tools",
          source: "plugin",
          tools: [
            {
              id: "docs_lookup",
              label: "Docs Lookup",
              description: "Search docs",
              rawDescription: "Search docs",
              source: "plugin",
              pluginId: "docs",
            },
          ],
        },
        {
          id: "channel",
          label: "Channel tools",
          source: "channel",
          tools: [
            {
              id: "message_actions",
              label: "Message Actions",
              description: "Act on messages",
              rawDescription: "Act on messages",
              source: "channel",
              channelId: "telegram",
            },
          ],
        },
      ],
    });
  });

  it("disambiguates duplicate labels with source ids", async () => {
    const { resolveEffectiveToolInventory } = await loadHarness({
      tools: [
        { name: "docs_lookup", label: "Lookup", description: "Search docs" },
        { name: "jira_lookup", label: "Lookup", description: "Search Jira" },
      ],
      pluginMeta: {
        docs_lookup: { pluginId: "docs" },
        jira_lookup: { pluginId: "jira" },
      },
    });

    const result = resolveEffectiveToolInventory({ cfg: {} });
    const labels = result.groups.flatMap((group) => group.tools.map((tool) => tool.label));

    expect(labels).toEqual(["Lookup (docs)", "Lookup (jira)"]);
  });

  it("prefers displaySummary over raw description", async () => {
    const { resolveEffectiveToolInventory } = await loadHarness({
      tools: [
        {
          name: "cron",
          label: "Cron",
          displaySummary: "Schedule and manage cron jobs.",
          description: "Long raw description\n\nACTIONS:\n- status",
        },
      ],
    });

    const result = resolveEffectiveToolInventory({ cfg: {} });

    expect(result.groups[0]?.tools[0]).toEqual({
      id: "cron",
      label: "Cron",
      description: "Schedule and manage cron jobs.",
      rawDescription: "Long raw description\n\nACTIONS:\n- status",
      source: "core",
    });
  });

  it("falls back to a sanitized summary for multi-line raw descriptions", async () => {
    const { resolveEffectiveToolInventory } = await loadHarness({
      tools: [
        {
          name: "cron",
          label: "Cron",
          description:
            "Manage Gateway cron jobs (status/list/add/update/remove/run/runs) and send wake events.\n\nACTIONS:\n- status: Check cron scheduler status\nJOB SCHEMA:\n{ ... }",
        },
      ],
    });

    const result = resolveEffectiveToolInventory({ cfg: {} });

    expect(result.groups[0]?.tools[0]?.description).toBe(
      "Manage Gateway cron jobs (status/list/add/update/remove/run/runs) and send wake events.",
    );
    expect(result.groups[0]?.tools[0]?.rawDescription).toContain("ACTIONS:");
  });

  it("includes the resolved tool profile", async () => {
    const { resolveEffectiveToolInventory } = await loadHarness({
      tools: [{ name: "exec", label: "Exec", description: "Run shell commands" }],
      effectivePolicy: { profile: "minimal", providerProfile: "coding" },
    });

    const result = resolveEffectiveToolInventory({ cfg: {} });

    expect(result.profile).toBe("coding");
  });

  it("passes resolved model compat into effective tool creation", async () => {
    const createToolsMock = vi.fn(() => [
      { name: "exec", label: "Exec", description: "Run shell commands" },
    ]);
    const { resolveEffectiveToolInventory } = await loadHarness({
      createToolsMock,
      resolvedModelCompat: { supportsTools: true, supportsNativeWebSearch: true },
    });

    resolveEffectiveToolInventory({
      cfg: {},
      agentDir: "/tmp/agents/main/agent",
      modelProvider: "xai",
      modelId: "grok-test",
    });

    expect(createToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowGatewaySubagentBinding: true,
        modelCompat: { supportsTools: true, supportsNativeWebSearch: true },
      }),
    );
  });
});
