import { beforeEach, describe, expect, it } from "vitest";
import { createPluginRecord } from "../plugins/status.test-helpers.js";
import {
  buildPluginDiagnosticsReport,
  buildPluginSmokeReport,
  buildPluginSnapshotReport,
  resetPluginsCliTestState,
  runPluginsCommand,
  runtimeLogs,
} from "./plugins-cli-test-helpers.js";

describe("plugins cli list", () => {
  beforeEach(() => {
    resetPluginsCliTestState();
  });

  it("includes imported state in JSON output", async () => {
    buildPluginSnapshotReport.mockReturnValue({
      workspaceDir: "/workspace",
      plugins: [
        createPluginRecord({
          id: "demo",
          imported: true,
          activated: true,
          explicitlyEnabled: true,
        }),
      ],
      diagnostics: [],
    });

    await runPluginsCommand(["plugins", "list", "--json"]);

    expect(buildPluginSnapshotReport).toHaveBeenCalledWith();

    expect(JSON.parse(runtimeLogs[0] ?? "null")).toEqual({
      workspaceDir: "/workspace",
      plugins: [
        expect.objectContaining({
          id: "demo",
          imported: true,
          activated: true,
          explicitlyEnabled: true,
        }),
      ],
      diagnostics: [],
    });
  });

  it("keeps doctor on a module-loading snapshot", async () => {
    buildPluginDiagnosticsReport.mockReturnValue({
      plugins: [],
      diagnostics: [],
    });

    await runPluginsCommand(["plugins", "doctor"]);

    expect(buildPluginDiagnosticsReport).toHaveBeenCalledWith();
    expect(runtimeLogs).toContain("No plugin issues detected.");
  });

  it("prints structured smoke JSON", async () => {
    buildPluginSmokeReport.mockReturnValue({
      scenarioId: "bundled-channels",
      classification: "packaged_entry_missing",
      summary: {
        pluginCount: 3,
        loadedCount: 0,
        errorCount: 1,
        disabledCount: 2,
      },
      entries: [
        {
          pluginId: "telegram",
          pluginName: "Telegram",
          status: "error",
          failurePhase: "load",
          classification: "packaged_entry_missing",
          summary: "missing packaged entry: dist/extensions/telegram/src/channel.setup.js",
          diagnostics: [
            {
              level: "error",
              pluginId: "telegram",
              message:
                'bundled plugin entry "./src/channel.setup.js" failed to open dist/extensions/telegram/src/channel.setup.js',
            },
          ],
        },
      ],
      diagnostics: [],
    });

    await expect(runPluginsCommand(["plugins", "smoke", "--json"])).rejects.toThrow("__exit__:1");

    expect(buildPluginSmokeReport).toHaveBeenCalledWith();
    expect(JSON.parse(runtimeLogs[0] ?? "null")).toEqual(
      expect.objectContaining({
        classification: "packaged_entry_missing",
        entries: [
          expect.objectContaining({
            pluginId: "telegram",
            classification: "packaged_entry_missing",
          }),
        ],
      }),
    );
  });

  it("redacts sensitive plugin smoke diagnostics in JSON output", async () => {
    buildPluginSmokeReport.mockReturnValue({
      scenarioId: "bundled-channels",
      workspaceDir: "/workspace/private",
      classification: "load_error",
      summary: {
        pluginCount: 1,
        loadedCount: 0,
        errorCount: 1,
        disabledCount: 0,
      },
      entries: [
        {
          pluginId: "telegram",
          pluginName: "Telegram",
          status: "error",
          failurePhase: "load",
          classification: "load_error",
          summary: "plugin path not found: /tmp/secret-plugin",
          diagnostics: [
            {
              level: "error",
              source: "/tmp/secret-plugin/index.js",
              message:
                "Authorization: Bearer topsecret plugin path /tmp/secret-plugin/index.js https://user:pass@example.com/hook?token=abc",
            },
          ],
        },
      ],
      diagnostics: [
        {
          level: "error",
          source: "/tmp/secret-plugin/index.js",
          message: "OPENAI_API_KEY=sk-secret-token",
        },
      ],
    });

    await expect(runPluginsCommand(["plugins", "smoke", "--json"])).rejects.toThrow("__exit__:1");

    const payload = JSON.parse(runtimeLogs[0] ?? "null");
    expect(payload.workspaceDir).toBeUndefined();
    expect(payload.entries[0].diagnostics[0].source).toBeUndefined();
    expect(payload.entries[0].diagnostics[0].message).not.toContain("topsecret");
    expect(payload.entries[0].diagnostics[0].message).not.toContain("/tmp/secret-plugin");
    expect(payload.entries[0].diagnostics[0].message).not.toContain("user:pass@example.com");
    expect(payload.diagnostics[0].message).not.toContain("sk-secret-token");
  });

  it("redacts sensitive plugin smoke diagnostics in terminal output too", async () => {
    buildPluginSmokeReport.mockReturnValue({
      scenarioId: "bundled-channels",
      classification: "load_error",
      summary: {
        pluginCount: 1,
        loadedCount: 0,
        errorCount: 1,
        disabledCount: 0,
      },
      entries: [
        {
          pluginId: "telegram",
          pluginName: "Telegram",
          status: "error",
          failurePhase: "path=/tmp/secret-plugin",
          classification: "load_error",
          summary: "file:///tmp/secret-plugin/index.js",
          diagnostics: [
            {
              level: "error",
              message:
                "Authorization: Bearer topsecret file:///tmp/secret-plugin/index.js https://user:pass@example.com/hook?token=abc",
            },
          ],
        },
      ],
      diagnostics: [],
    });

    await expect(runPluginsCommand(["plugins", "smoke"])).rejects.toThrow("__exit__:1");

    const output = runtimeLogs.join("\n");
    expect(output).not.toContain("topsecret");
    expect(output).not.toContain("/tmp/secret-plugin");
    expect(output).not.toContain("user:pass@example.com");
  });

  it("exits non-zero for non-json smoke failures", async () => {
    buildPluginSmokeReport.mockReturnValue({
      scenarioId: "bundled-channels",
      classification: "load_error",
      summary: {
        pluginCount: 1,
        loadedCount: 1,
        errorCount: 1,
        disabledCount: 0,
      },
      entries: [
        {
          pluginId: "__global__",
          pluginName: "Global diagnostics",
          status: "error",
          classification: "load_error",
          summary: "plugin failed to load",
          diagnostics: [
            {
              level: "error",
              message: "plugin path not found: /tmp/missing-plugin",
            },
          ],
        },
      ],
      diagnostics: [
        {
          level: "error",
          message: "plugin path not found: /tmp/missing-plugin",
        },
      ],
    });

    await expect(runPluginsCommand(["plugins", "smoke"])).rejects.toThrow("__exit__:1");

    expect(runtimeLogs.join("\n")).toContain("1 loaded, 1 errored, 0 disabled");
    expect(runtimeLogs.join("\n")).toContain("global diagnostics");
  });

  it("sanitizes smoke labels and summaries before printing to the terminal", async () => {
    buildPluginSmokeReport.mockReturnValue({
      scenarioId: "bundled-channels",
      classification: "load_error",
      summary: {
        pluginCount: 1,
        loadedCount: 0,
        errorCount: 1,
        disabledCount: 0,
      },
      entries: [
        {
          pluginId: "bad-plugin",
          pluginName: "\u001B[31mBad Plugin",
          status: "error",
          failurePhase: "load\nphase",
          classification: "load_error",
          summary: "bad\toutput\u001B[2J",
          diagnostics: [
            {
              level: "error",
              message: "plugin failed to load",
            },
          ],
        },
      ],
      diagnostics: [],
    });

    await expect(runPluginsCommand(["plugins", "smoke"])).rejects.toThrow("__exit__:1");

    const output = runtimeLogs.join("\n");
    expect(output).toContain("Bad Plugin (bad-plugin)");
    expect(output).toContain("bad\\toutput");
    expect(output).toContain("phase: load\\nphase");
    expect(output).not.toContain("\u001B[31m");
    expect(output).not.toContain("\u001B[2J");
  });
});
