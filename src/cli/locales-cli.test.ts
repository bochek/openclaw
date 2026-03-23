import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAgentWorkspaceDir: vi.fn<(config: unknown, agentId: string) => string>(
    () => "/tmp/workspace",
  ),
  resolveDefaultAgentWorkspaceDir: vi.fn<() => string>(() => "/tmp/fallback-workspace"),
  loadConfig: vi.fn<() => { plugins: Record<string, unknown> }>(() => ({ plugins: {} })),
  loadLocaleRegistry: vi.fn<
    (options?: unknown) => {
      packages: unknown[];
      entries: unknown[];
      selections: unknown[];
      conflicts: unknown[];
      diagnostics: unknown[];
    }
  >(() => ({
    packages: [],
    entries: [],
    selections: [],
    conflicts: [],
    diagnostics: [],
  })),
  getSelectedLocaleResource: vi.fn<(registry: unknown, locale: string, kind: string) => unknown>(
    () => null,
  ),
  syncDocsLocales: vi.fn<
    (options?: unknown) => Promise<{
      docsDir: string;
      sourceConfigPath: string;
      workspaceDir: string;
      outputConfigPath: string;
      syncedLocales: unknown[];
    }>
  >(async () => ({
    docsDir: "/tmp/docs",
    sourceConfigPath: "/tmp/docs/docs.json",
    workspaceDir: "/tmp/docs/.generated/locale-workspace",
    outputConfigPath: "/tmp/docs/.generated/locale-workspace/docs.json",
    syncedLocales: [],
  })),
  runCommandWithRuntime: vi.fn<(runtime: unknown, fn: () => Promise<void>) => Promise<void>>(
    async (_runtime: unknown, fn: () => Promise<void>) => await fn(),
  ),
  log: vi.fn<(value: unknown) => void>(),
  error: vi.fn<(value: unknown) => void>(),
  exit: vi.fn<(value: unknown) => void>(),
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDir: (config: unknown, agentId: string) =>
    mocks.resolveAgentWorkspaceDir(config, agentId),
  resolveDefaultAgentId: () => "main",
}));

vi.mock("../agents/workspace.js", () => ({
  resolveDefaultAgentWorkspaceDir: () => mocks.resolveDefaultAgentWorkspaceDir(),
}));

vi.mock("../config/config.js", () => ({
  loadConfig: () => mocks.loadConfig(),
}));

vi.mock("../locales/registry.js", () => ({
  loadLocaleRegistry: (options?: unknown) => mocks.loadLocaleRegistry(options),
  getSelectedLocaleResource: (registry: unknown, locale: string, kind: string) =>
    mocks.getSelectedLocaleResource(registry, locale, kind),
}));

vi.mock("../locales/sync-docs.js", () => ({
  syncDocsLocales: (options?: unknown) => mocks.syncDocsLocales(options),
}));

vi.mock("./cli-utils.js", () => ({
  runCommandWithRuntime: (runtime: unknown, fn: () => Promise<void>) =>
    mocks.runCommandWithRuntime(runtime, fn),
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: {
    log: (value: unknown) => mocks.log(value),
    error: (value: unknown) => mocks.error(value),
    exit: (value: unknown) => mocks.exit(value),
  },
}));

const { registerLocalesCli } = await import("./locales-cli.js");

describe("registerLocalesCli", () => {
  beforeEach(() => {
    mocks.resolveAgentWorkspaceDir.mockReset().mockReturnValue("/tmp/workspace");
    mocks.resolveDefaultAgentWorkspaceDir.mockReset().mockReturnValue("/tmp/fallback-workspace");
    mocks.loadConfig.mockReset().mockReturnValue({ plugins: {} });
    mocks.loadLocaleRegistry.mockReset().mockReturnValue({
      packages: [],
      entries: [],
      selections: [],
      conflicts: [],
      diagnostics: [],
    });
    mocks.getSelectedLocaleResource.mockReset().mockReturnValue(null);
    mocks.syncDocsLocales.mockReset().mockResolvedValue({
      docsDir: "/tmp/docs",
      sourceConfigPath: "/tmp/docs/docs.json",
      workspaceDir: "/tmp/docs/.generated/locale-workspace",
      outputConfigPath: "/tmp/docs/.generated/locale-workspace/docs.json",
      syncedLocales: [],
    });
    mocks.runCommandWithRuntime.mockReset().mockImplementation(async (_runtime, fn) => await fn());
    mocks.log.mockReset();
    mocks.error.mockReset();
    mocks.exit.mockReset();
  });

  it("loads locale registry using the resolved workspace for list", async () => {
    mocks.resolveAgentWorkspaceDir.mockReturnValueOnce("/tmp/workspace");
    const program = new Command().name("openclaw");
    registerLocalesCli(program);

    await program.parseAsync(["node", "openclaw", "locales", "list"], { from: "node" });

    expect(mocks.loadLocaleRegistry).toHaveBeenCalledWith({
      config: { plugins: {} },
      workspaceDir: "/tmp/workspace",
    });
  });

  it("marks only the exact selected artifact as selected in list output", async () => {
    mocks.loadLocaleRegistry.mockReturnValueOnce({
      packages: [
        {
          pluginId: "locale-de",
          locale: "de",
          origin: "workspace",
          rootDir: "/tmp/workspace-copy",
          manifestPath: "/tmp/workspace-copy/openclaw.plugin.json",
          resourceKinds: ["docs"],
        },
        {
          pluginId: "locale-de",
          locale: "de",
          origin: "bundled",
          rootDir: "/tmp/bundled-copy",
          manifestPath: "/tmp/bundled-copy/openclaw.plugin.json",
          resourceKinds: ["docs"],
        },
      ],
      entries: [],
      selections: [],
      conflicts: [],
      diagnostics: [],
    });
    mocks.getSelectedLocaleResource.mockImplementation((_registry, locale, kind) => {
      if (locale === "de" && kind === "docs") {
        return {
          selected: {
            pluginId: "locale-de",
            rootDir: "/tmp/workspace-copy",
            manifestPath: "/tmp/workspace-copy/openclaw.plugin.json",
            origin: "workspace",
          },
        };
      }
      return null;
    });

    const program = new Command().name("openclaw");
    registerLocalesCli(program);

    await program.parseAsync(["node", "openclaw", "locales", "list"], { from: "node" });

    const lines = mocks.log.mock.calls.map((call) =>
      typeof call[0] === "string" ? call[0] : JSON.stringify(call[0]),
    );
    const selectedLines = lines.filter((line) => line.includes("selected: docs"));
    expect(selectedLines).toHaveLength(1);
    expect(selectedLines[0]).toContain("locale-de");
  });
});
