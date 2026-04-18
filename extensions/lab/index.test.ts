import type { OpenClawPluginCommandDefinition } from "openclaw/plugin-sdk/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/plugins/plugin-api.js";

const runtimeMocks = vi.hoisted(() => ({
  resolveStorePath: vi.fn(),
  loadSessionStore: vi.fn(),
  loadGatewaySessionRow: vi.fn(),
  resolveSessionAgentIds: vi.fn(),
  resolveCurrentLabsModelId: vi.fn(),
  loadLabsModelAgentsOverride: vi.fn(),
  loadLabsAgentAgentsOverride: vi.fn(),
  hasTruncatedLabsAgentsOverrideFiles: vi.fn(),
  isLabsModelOverridesEnabled: vi.fn(),
  listActiveLabsAgentsOverridePaths: vi.fn(),
  resolveLabsModelAgentsOverridePath: vi.fn(),
  resolveLabsAgentAgentsOverridePath: vi.fn(),
}));

vi.mock("../../src/agents/agent-scope.js", () => ({
  resolveSessionAgentIds: runtimeMocks.resolveSessionAgentIds,
}));

vi.mock("../../src/config/sessions/paths.js", () => ({
  resolveStorePath: runtimeMocks.resolveStorePath,
}));

vi.mock("../../src/config/sessions/store.js", () => ({
  loadSessionStore: runtimeMocks.loadSessionStore,
}));

vi.mock("../../src/gateway/session-utils.js", () => ({
  loadGatewaySessionRow: runtimeMocks.loadGatewaySessionRow,
}));

vi.mock("../../src/lab/model-overrides.js", () => ({
  loadLabsModelAgentsOverride: runtimeMocks.loadLabsModelAgentsOverride,
  loadLabsAgentAgentsOverride: runtimeMocks.loadLabsAgentAgentsOverride,
  resolveCurrentLabsModelId: runtimeMocks.resolveCurrentLabsModelId,
  hasTruncatedLabsAgentsOverrideFiles: runtimeMocks.hasTruncatedLabsAgentsOverrideFiles,
  isLabsModelOverridesEnabled: runtimeMocks.isLabsModelOverridesEnabled,
  listActiveLabsAgentsOverridePaths: runtimeMocks.listActiveLabsAgentsOverridePaths,
  resolveLabsModelAgentsOverridePath: runtimeMocks.resolveLabsModelAgentsOverridePath,
  resolveLabsAgentAgentsOverridePath: runtimeMocks.resolveLabsAgentAgentsOverridePath,
}));

import labsPlugin from "./index.js";

function registerLabsCommand(params?: {
  runtime?: ReturnType<typeof createTestPluginApi>["runtime"];
}): OpenClawPluginCommandDefinition {
  let command: OpenClawPluginCommandDefinition | undefined;
  labsPlugin.register(
    createTestPluginApi({
      id: "lab",
      name: "Lab",
      source: "test",
      runtime: params?.runtime,
      registerCommand: (nextCommand) => {
        command = nextCommand;
      },
    }),
  );
  if (!command) {
    throw new Error("lab plugin did not register /lab");
  }
  return command;
}

describe("lab /lab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.resolveSessionAgentIds.mockReturnValue({ sessionAgentId: "reviewer" });
    runtimeMocks.resolveStorePath.mockReturnValue("/tmp/sessions.json");
    runtimeMocks.loadSessionStore.mockReturnValue({
      "session-1": {
        model: "gpt-5.4",
        modelProvider: "openai",
        systemPromptReport: {
          workspaceDir: "/tmp/workspace",
          injectedWorkspaceFiles: [],
        },
      },
    });
    runtimeMocks.loadGatewaySessionRow.mockReturnValue({
      modelProvider: "openai",
      model: "gpt-5.4",
    });
    runtimeMocks.resolveCurrentLabsModelId.mockReturnValue("gpt-5.4");
    runtimeMocks.resolveLabsModelAgentsOverridePath.mockReturnValue(
      "/tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md",
    );
    runtimeMocks.resolveLabsAgentAgentsOverridePath.mockReturnValue(
      "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
    );
    runtimeMocks.listActiveLabsAgentsOverridePaths.mockReturnValue([
      "/tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md",
      "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
    ]);
    runtimeMocks.loadLabsModelAgentsOverride.mockResolvedValue({
      name: "AGENTS.md",
      path: "/tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md",
      content: "model",
      missing: false,
      labsKind: "model",
    });
    runtimeMocks.loadLabsAgentAgentsOverride.mockResolvedValue({
      name: "AGENTS.md",
      path: "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
      content: "agent",
      missing: false,
      labsKind: "agent",
    });
    runtimeMocks.isLabsModelOverridesEnabled.mockReturnValue(true);
    runtimeMocks.hasTruncatedLabsAgentsOverrideFiles.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports Lab model override status for the active session", async () => {
    const command = registerLabsCommand();
    expect(command.requireAuth).toBe(true);
    const result = await command.handler({
      args: "custom status",
      sessionKey: "session-1",
      config: {},
    } as never);

    expect(result).toMatchObject({
      disableMarkdown: true,
    });
    expect(result?.text).toContain("plugin: enabled");
    expect(result?.text).toContain("features:");
    expect(result?.text).toContain("- custom overrides: enabled");
    expect(result?.text).toContain("model: gpt-5.4");
    expect(result?.text).toContain("agent: reviewer");
    expect(result?.text).toContain("workspace: /tmp/workspace");
    expect(result?.text).toContain("model override: present");
    expect(result?.text).toContain("agent override: present");
    expect(result?.text).toContain("checked paths:");
    expect(result?.text).toContain(
      "- model: /tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md",
    );
    expect(result?.text).toContain(
      "- agent: /tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
    );
    expect(result?.text).toContain("active addenda:");
    expect(result?.text).toContain("/tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md");
    expect(result?.text).toContain(
      "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
    );
    expect(result?.text).toContain("truncated: no");
  });

  it("shows the Lab feature menu with no args", async () => {
    const command = registerLabsCommand();
    const result = await command.handler({
      args: "",
      config: {},
    } as never);

    expect(result?.text).toContain("Experimental feature controls");
    expect(result?.text).toContain("Features:");
    expect(result?.text).toContain("- custom overrides: enabled");
    expect(result?.text).toContain("/lab custom status");
    expect(result?.text).toContain("/lab enable custom");
    expect(result?.text).toContain("/lab disable custom");
  });

  it("rejects unsupported Lab subcommands and points callers at feature commands", async () => {
    const command = registerLabsCommand();
    const result = await command.handler({
      args: "on",
      config: {},
    } as never);

    expect(result?.text).toContain("Unsupported Lab command: on");
    expect(result?.text).toContain("/lab custom status");
    expect(result?.text).toContain("/lab enable custom");
    expect(result?.text).toContain("/lab disable custom");
  });

  it("reports absent overrides and truncation when the session report indicates both", async () => {
    runtimeMocks.loadLabsModelAgentsOverride.mockResolvedValue(null);
    runtimeMocks.loadLabsAgentAgentsOverride.mockResolvedValue(null);
    runtimeMocks.isLabsModelOverridesEnabled.mockReturnValue(false);
    runtimeMocks.hasTruncatedLabsAgentsOverrideFiles.mockReturnValue(true);

    const command = registerLabsCommand();
    const result = await command.handler({
      args: "custom status",
      sessionKey: "session-1",
      config: {
        plugins: {
          entries: {
            lab: {
              enabled: false,
            },
          },
        },
      },
    } as never);

    expect(result?.text).toContain("plugin: disabled");
    expect(result?.text).toContain("features:");
    expect(result?.text).toContain("- custom overrides: disabled");
    expect(result?.text).toContain("workspace: /tmp/workspace");
    expect(result?.text).toContain("model override: absent");
    expect(result?.text).toContain("agent override: absent");
    expect(result?.text).toContain("checked paths:");
    expect(result?.text).toContain(
      "- model: /tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md",
    );
    expect(result?.text).toContain(
      "- agent: /tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
    );
    expect(result?.text).toContain("active addenda:");
    expect(result?.text).toContain("- none");
    expect(result?.text).toContain("truncated: yes");
  });

  it("uses guarded loadability instead of raw path existence for status", async () => {
    runtimeMocks.loadLabsModelAgentsOverride.mockResolvedValue(null);
    runtimeMocks.loadLabsAgentAgentsOverride.mockResolvedValue({
      name: "AGENTS.md",
      path: "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
      content: "agent",
      missing: false,
      labsKind: "agent",
    });

    const command = registerLabsCommand();
    const result = await command.handler({
      args: "custom status",
      sessionKey: "session-1",
      config: {},
    } as never);

    expect(result?.text).toContain("model override: absent");
    expect(result?.text).toContain("agent override: present");
  });

  it("prefers the gateway session row model over stale stored runtime model", async () => {
    runtimeMocks.loadSessionStore.mockReturnValue({
      "session-1": {
        model: "MiniMax-M2.5",
        modelProvider: "minimax-portal",
        systemPromptReport: {
          workspaceDir: "/tmp/workspace",
          injectedWorkspaceFiles: [],
        },
      },
    });
    runtimeMocks.loadGatewaySessionRow.mockReturnValue({
      modelProvider: "openai",
      model: "gpt-5.4",
    });
    runtimeMocks.resolveCurrentLabsModelId.mockImplementation(({ sessionEntry }) => {
      expect(sessionEntry?.modelProvider).toBe("openai");
      expect(sessionEntry?.model).toBe("gpt-5.4");
      return "gpt-5.4";
    });

    const command = registerLabsCommand();
    const result = await command.handler({
      args: "custom status",
      sessionKey: "session-1",
      config: {},
    } as never);

    expect(result?.text).toContain("model: gpt-5.4");
  });

  it("persists /lab enable custom via runtime config writes", async () => {
    let runtimeConfig: Record<string, unknown> = {};
    const runtime = {
      config: {
        loadConfig: vi.fn(() => runtimeConfig),
        writeConfigFile: vi.fn(async (nextConfig: Record<string, unknown>) => {
          runtimeConfig = nextConfig;
        }),
      },
    } as unknown as ReturnType<typeof createTestPluginApi>["runtime"];
    const command = registerLabsCommand({ runtime });

    const result = await command.handler({
      args: "enable custom",
      channel: "telegram",
      config: {},
    } as never);

    expect(runtime.config.writeConfigFile).toHaveBeenCalledTimes(1);
    expect(result?.text).toContain("Lab custom overrides enabled.");
    expect(result?.text).toContain("plugin: enabled");
    expect(result?.text).toContain("- custom overrides: enabled");
    expect(runtimeConfig).toMatchObject({
      plugins: {
        entries: {
          lab: {
            enabled: true,
            config: {
              modelOverrides: {
                enabled: true,
              },
            },
          },
        },
      },
    });
  });

  it("blocks /lab disable custom for gateway callers missing operator.admin", async () => {
    const runtime = {
      config: {
        loadConfig: vi.fn(() => ({})),
        writeConfigFile: vi.fn(async () => undefined),
      },
    } as unknown as ReturnType<typeof createTestPluginApi>["runtime"];
    const command = registerLabsCommand({ runtime });

    const result = await command.handler({
      args: "disable custom",
      channel: "webchat",
      gatewayClientScopes: ["operator.write"],
      config: {},
    } as never);

    expect(result?.text).toContain("requires operator.admin");
    expect(runtime.config.writeConfigFile).not.toHaveBeenCalled();
  });

  it("rejects unknown Lab features with the known feature list", async () => {
    const command = registerLabsCommand();
    const result = await command.handler({
      args: "enable mystery",
      config: {},
    } as never);

    expect(result?.text).toContain("Unknown Lab feature: mystery");
    expect(result?.text).toContain("Available features:");
    expect(result?.text).toContain("- custom overrides: enabled");
  });
});
