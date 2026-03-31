import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig, ConfigFileSnapshot } from "../config/types.openclaw.js";
import type { UpdateRunResult } from "../infra/update-runner.js";
import { BUNDLED_RUNTIME_SIDECAR_PATHS } from "../plugins/public-artifacts.js";
import { withEnvAsync } from "../test-utils/env.js";
import { createCliRuntimeCapture } from "./test-runtime-capture.js";

const confirm = vi.fn();
const select = vi.fn();
const spinner = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));
const isCancel = (value: unknown) => value === "cancel";

const runGatewayUpdateMock = vi.fn();
const resolveOpenClawPackageRootMock = vi.fn();
const readConfigFileSnapshotMock = vi.fn();
const replaceConfigFileMock = vi.fn();
const checkUpdateStatusMock = vi.fn();
const fetchNpmPackageTargetStatusMock = vi.fn();
const fetchNpmTagVersionMock = vi.fn();
const resolveNpmChannelTagMock = vi.fn();
const runCommandWithTimeoutMock = vi.fn();
const runDaemonRestartMock = vi.fn();
const doctorCommandMock = vi.fn();

const readPackageName = vi.fn();
const readPackageVersion = vi.fn();
const resolveGlobalManager = vi.fn();
const spawnSyncMock = vi.fn();
const serviceLoaded = vi.fn();
const prepareRestartScript = vi.fn();
const runRestartScript = vi.fn();
const mockedRunDaemonInstall = vi.fn();
const serviceReadRuntime = vi.fn();
const inspectPortUsage = vi.fn();
const classifyPortListener = vi.fn();
const formatPortDiagnostics = vi.fn();
const pathExists = vi.fn();
const syncPluginsForUpdateChannel = vi.fn();
const updateNpmInstalledPlugins = vi.fn();
const nodeVersionSatisfiesEngine = vi.fn();
const { defaultRuntime: runtimeCapture, resetRuntimeCapture } = createCliRuntimeCapture();

vi.mock("@clack/prompts", () => ({
  confirm,
  select,
  isCancel,
  spinner,
}));

// Mock the update-runner module
vi.mock("../infra/update-runner.js", () => ({
  runGatewayUpdate: runGatewayUpdateMock,
}));

vi.mock("../infra/openclaw-root.js", () => ({
  resolveOpenClawPackageRoot: resolveOpenClawPackageRootMock,
}));

vi.mock("../config/config.js", () => ({
  readConfigFileSnapshot: readConfigFileSnapshotMock,
  replaceConfigFile: replaceConfigFileMock,
  resolveGatewayPort: vi.fn(() => 18789),
}));

vi.mock("../infra/update-check.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../infra/update-check.js")>();
  return {
    ...actual,
    checkUpdateStatus: checkUpdateStatusMock,
    fetchNpmPackageTargetStatus: fetchNpmPackageTargetStatusMock,
    fetchNpmTagVersion: fetchNpmTagVersionMock,
    resolveNpmChannelTag: resolveNpmChannelTagMock,
  };
});

vi.mock("../infra/runtime-guard.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../infra/runtime-guard.js")>();
  return {
    ...actual,
    nodeVersionSatisfiesEngine,
  };
});

vi.mock("../process/exec.js", () => ({
  runCommandWithTimeout: runCommandWithTimeoutMock,
}));

vi.mock("../utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils.js")>();
  return {
    ...actual,
    pathExists: (...args: unknown[]) => pathExists(...args),
  };
});

vi.mock("../plugins/update.js", () => ({
  syncPluginsForUpdateChannel: (...args: unknown[]) => syncPluginsForUpdateChannel(...args),
  updateNpmInstalledPlugins: (...args: unknown[]) => updateNpmInstalledPlugins(...args),
}));

vi.mock("./update-cli/shared.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./update-cli/shared.js")>();
  return {
    ...actual,
    readPackageName,
    readPackageVersion,
    resolveGlobalManager,
  };
});

vi.mock("../daemon/service.js", () => ({
  resolveGatewayService: vi.fn(() => ({
    isLoaded: (...args: unknown[]) => serviceLoaded(...args),
    readRuntime: (...args: unknown[]) => serviceReadRuntime(...args),
  })),
}));

vi.mock("../infra/ports.js", () => ({
  inspectPortUsage: (...args: unknown[]) => inspectPortUsage(...args),
  classifyPortListener: (...args: unknown[]) => classifyPortListener(...args),
  formatPortDiagnostics: (...args: unknown[]) => formatPortDiagnostics(...args),
}));

vi.mock("./update-cli/restart-helper.js", () => ({
  prepareRestartScript: (...args: unknown[]) => prepareRestartScript(...args),
  runRestartScript: (...args: unknown[]) => runRestartScript(...args),
}));

// Mock doctor (heavy module; should not run in unit tests)
vi.mock("../commands/doctor.js", () => ({
  doctorCommand: doctorCommandMock,
}));
// Mock the daemon-cli module
vi.mock("./daemon-cli.js", () => ({
  runDaemonInstall: mockedRunDaemonInstall,
  runDaemonRestart: runDaemonRestartMock,
}));

// Mock the runtime
vi.mock("../runtime.js", () => ({
  defaultRuntime: runtimeCapture,
}));

const { runGatewayUpdate } = await import("../infra/update-runner.js");
const { resolveOpenClawPackageRoot } = await import("../infra/openclaw-root.js");
const { readConfigFileSnapshot, replaceConfigFile } = await import("../config/config.js");
const { checkUpdateStatus, fetchNpmPackageTargetStatus, fetchNpmTagVersion, resolveNpmChannelTag } =
  await import("../infra/update-check.js");
const { runCommandWithTimeout } = await import("../process/exec.js");
const { runDaemonRestart, runDaemonInstall } = await import("./daemon-cli.js");
const { doctorCommand } = await import("../commands/doctor.js");
const { defaultRuntime } = await import("../runtime.js");
const { updateCommand, updateStatusCommand, updateWizardCommand } = await import("./update-cli.js");
const { __testing: updateCommandTesting } = await import("./update-cli/update-command.js");
const { __testing: updateProgressTesting } = await import("./update-cli/progress.js");
const { __testing: updateStatusTesting } = await import("./update-cli/status.js");
const { __testing: updateWizardTesting } = await import("./update-cli/wizard.js");
const { __testing: updateCliSharedTesting, resolveGitInstallDir } = await import(
  "./update-cli/shared.js"
);

type UpdateCliScenario = {
  name: string;
  run: () => Promise<void>;
  assert: () => void;
};

describe("update-cli", () => {
  const fixtureRoot = "/tmp/openclaw-update-tests";
  let fixtureCount = 0;

  const createCaseDir = (prefix: string) => {
    const dir = path.join(fixtureRoot, `${prefix}-${fixtureCount++}`);
    // Tests only need a stable path; the directory does not have to exist because all I/O is mocked.
    return dir;
  };

  const baseConfig = {} as OpenClawConfig;
  const baseSnapshot: ConfigFileSnapshot = {
    path: "/tmp/openclaw-config.json",
    exists: true,
    raw: "{}",
    parsed: {},
    resolved: baseConfig,
    sourceConfig: baseConfig,
    valid: true,
    config: baseConfig,
    runtimeConfig: baseConfig,
    issues: [],
    warnings: [],
    legacyIssues: [],
  };

  const setTty = (value: boolean | undefined) => {
    Object.defineProperty(process.stdin, "isTTY", {
      value,
      configurable: true,
    });
  };

  const setStdoutTty = (value: boolean | undefined) => {
    Object.defineProperty(process.stdout, "isTTY", {
      value,
      configurable: true,
    });
  };

  const mockPackageInstallStatus = (root: string) => {
    resolveOpenClawPackageRootMock.mockResolvedValue(root);
    checkUpdateStatusMock.mockResolvedValue({
      root,
      installKind: "package",
      packageManager: "npm",
      deps: {
        manager: "npm",
        status: "ok",
        lockfilePath: null,
        markerPath: null,
      },
    });
  };

  const expectUpdateCallChannel = (channel: string) => {
    const call = runGatewayUpdateMock.mock.calls[0]?.[0];
    expect(call?.channel).toBe(channel);
    return call;
  };

  const expectPackageInstallSpec = (spec: string) => {
    expect(runGatewayUpdateMock).not.toHaveBeenCalled();
    expect(runCommandWithTimeoutMock).toHaveBeenCalledWith(
      ["npm", "i", "-g", spec, "--no-fund", "--no-audit", "--loglevel=error"],
      expect.any(Object),
    );
  };

  const makeOkUpdateResult = (overrides: Partial<UpdateRunResult> = {}): UpdateRunResult =>
    ({
      status: "ok",
      mode: "git",
      steps: [],
      durationMs: 100,
      ...overrides,
    }) as UpdateRunResult;

  const runUpdateCliScenario = async (testCase: UpdateCliScenario) => {
    vi.clearAllMocks();
    await testCase.run();
    testCase.assert();
  };

  const runRestartFallbackScenario = async (params: { daemonInstall: "ok" | "fail" }) => {
    runGatewayUpdateMock.mockResolvedValue(makeOkUpdateResult());
    if (params.daemonInstall === "fail") {
      mockedRunDaemonInstall.mockRejectedValueOnce(new Error("refresh failed"));
    } else {
      mockedRunDaemonInstall.mockResolvedValue(undefined);
    }
    prepareRestartScript.mockResolvedValue(null);
    serviceLoaded.mockResolvedValue(true);
    runDaemonRestartMock.mockResolvedValue(true);

    await updateCommand({});

    expect(mockedRunDaemonInstall).toHaveBeenCalledWith({
      force: true,
      json: undefined,
    });
    expect(runDaemonRestartMock).toHaveBeenCalled();
  };

  const setupNonInteractiveDowngrade = async () => {
    const tempDir = createCaseDir("openclaw-update");
    setTty(false);
    readPackageVersion.mockResolvedValue("2.0.0");

    mockPackageInstallStatus(tempDir);
    resolveNpmChannelTagMock.mockResolvedValue({
      tag: "latest",
      version: "0.0.1",
    });
    runGatewayUpdateMock.mockResolvedValue({
      status: "ok",
      mode: "npm",
      steps: [],
      durationMs: 100,
    });
    runtimeCapture.error.mockClear();
    runtimeCapture.exit.mockClear();

    return tempDir;
  };

  const setupUpdatedRootRefresh = (params?: {
    gatewayUpdateImpl?: () => Promise<UpdateRunResult>;
  }) => {
    const root = createCaseDir("openclaw-updated-root");
    const entryPath = path.join(root, "dist", "entry.js");
    pathExists.mockImplementation(async (candidate: string) => candidate === entryPath);
    if (params?.gatewayUpdateImpl) {
      runGatewayUpdateMock.mockImplementation(params.gatewayUpdateImpl);
    } else {
      runGatewayUpdateMock.mockResolvedValue({
        status: "ok",
        mode: "npm",
        root,
        steps: [],
        durationMs: 100,
      });
    }
    serviceLoaded.mockResolvedValue(true);
    return { root, entryPath };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRuntimeCapture();
    runtimeCapture.exit.mockImplementation(() => {});
    resolveOpenClawPackageRootMock.mockResolvedValue(process.cwd());
    readConfigFileSnapshotMock.mockResolvedValue(baseSnapshot);
    fetchNpmTagVersionMock.mockResolvedValue({
      tag: "latest",
      version: "9999.0.0",
    });
    fetchNpmPackageTargetStatusMock.mockResolvedValue({
      target: "latest",
      version: "9999.0.0",
      nodeEngine: ">=22.14.0",
    });
    resolveNpmChannelTagMock.mockResolvedValue({
      tag: "latest",
      version: "9999.0.0",
    });
    nodeVersionSatisfiesEngine.mockReturnValue(true);
    checkUpdateStatusMock.mockResolvedValue({
      root: "/test/path",
      installKind: "git",
      packageManager: "pnpm",
      git: {
        root: "/test/path",
        sha: "abcdef1234567890",
        tag: "v1.2.3",
        branch: "main",
        upstream: "origin/main",
        dirty: false,
        ahead: 0,
        behind: 0,
        fetchOk: true,
      },
      deps: {
        manager: "pnpm",
        status: "ok",
        lockfilePath: "/test/path/pnpm-lock.yaml",
        markerPath: "/test/path/node_modules",
      },
      registry: {
        latestVersion: "1.2.3",
      },
    });
    runCommandWithTimeoutMock.mockResolvedValue({
      stdout: "",
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
      termination: "exit",
    });
    readPackageName.mockResolvedValue("openclaw");
    readPackageVersion.mockResolvedValue("1.0.0");
    resolveGlobalManager.mockResolvedValue("npm");
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({
      pid: 0,
      output: [],
      stdout: "",
      stderr: "",
      status: 0,
      signal: null,
    });
    updateCliSharedTesting.resetDepsForTest();
    updateCliSharedTesting.setDepsForTest({
      defaultRuntime: runtimeCapture,
      spawnSync: (...args) => spawnSyncMock(...args),
    });
    updateCommandTesting.resetDepsForTest();
    updateCommandTesting.setDepsForTest({
      defaultRuntime: runtimeCapture,
    });
    updateProgressTesting.resetDepsForTest();
    updateProgressTesting.setDepsForTest({
      defaultRuntime: runtimeCapture,
    });
    updateStatusTesting.resetDepsForTest();
    updateStatusTesting.setDepsForTest({
      defaultRuntime: runtimeCapture,
    });
    updateWizardTesting.resetDepsForTest();
    updateWizardTesting.setDepsForTest({
      confirm: (...args) => confirm(...args),
      defaultRuntime: runtimeCapture,
      isCancel,
      selectStyled: (...args) => select(...args),
      updateCommand,
    });
    serviceLoaded.mockResolvedValue(false);
    serviceReadRuntime.mockResolvedValue({
      status: "running",
      pid: 4242,
      state: "running",
    });
    prepareRestartScript.mockResolvedValue("/tmp/openclaw-restart-test.sh");
    runRestartScript.mockResolvedValue(undefined);
    inspectPortUsage.mockResolvedValue({
      port: 18789,
      status: "busy",
      listeners: [{ pid: 4242, command: "openclaw-gateway" }],
      hints: [],
    });
    classifyPortListener.mockReturnValue("gateway");
    formatPortDiagnostics.mockReturnValue(["Port 18789 is already in use."]);
    pathExists.mockResolvedValue(false);
    syncPluginsForUpdateChannel.mockResolvedValue({
      changed: false,
      config: baseConfig,
      summary: {
        switchedToBundled: [],
        switchedToNpm: [],
        warnings: [],
        errors: [],
      },
    });
    updateNpmInstalledPlugins.mockResolvedValue({
      changed: false,
      config: baseConfig,
      outcomes: [],
    });
    mockedRunDaemonInstall.mockResolvedValue(undefined);
    runDaemonRestartMock.mockResolvedValue(true);
    doctorCommandMock.mockResolvedValue(undefined);
    confirm.mockResolvedValue(false);
    select.mockResolvedValue("stable");
    runGatewayUpdateMock.mockResolvedValue(makeOkUpdateResult());
    setTty(false);
    setStdoutTty(false);
  });

  it.each([
    {
      name: "preview mode",
      run: async () => {
        runtimeCapture.log.mockClear();
        serviceLoaded.mockResolvedValue(true);
        await updateCommand({ dryRun: true, channel: "beta" });
      },
      assert: () => {
        expect(replaceConfigFileMock).not.toHaveBeenCalled();
        expect(runGatewayUpdateMock).not.toHaveBeenCalled();
        expect(mockedRunDaemonInstall).not.toHaveBeenCalled();
        expect(runRestartScript).not.toHaveBeenCalled();
        expect(runDaemonRestartMock).not.toHaveBeenCalled();

        const logs = runtimeCapture.log.mock.calls.map((call) => String(call[0]));
        expect(logs.join("\n")).toContain("Update dry-run");
        expect(logs.join("\n")).toContain("No changes were applied.");
      },
    },
    {
      name: "downgrade bypass",
      run: async () => {
        await setupNonInteractiveDowngrade();
        runtimeCapture.exit.mockClear();
        await updateCommand({ dryRun: true });
      },
      assert: () => {
        expect(runtimeCapture.exit.mock.calls.some((call) => call[0] === 1)).toBe(false);
        expect(runGatewayUpdateMock).not.toHaveBeenCalled();
      },
    },
  ] as const)("updateCommand dry-run behavior: $name", runUpdateCliScenario);

  it.each([
    {
      name: "table output",
      run: async () => {
        runtimeCapture.log.mockClear();
        await updateStatusCommand({ json: false });
      },
      assert: () => {
        const logs = runtimeCapture.log.mock.calls.map((call) => call[0]);
        expect(logs.join("\n")).toContain("OpenClaw update status");
      },
    },
    {
      name: "json output",
      run: async () => {
        runtimeCapture.log.mockClear();
        await updateStatusCommand({ json: true });
      },
      assert: () => {
        const last = runtimeCapture.writeJson.mock.calls.at(-1)?.[0];
        expect(last).toBeDefined();
        const parsed = last as Record<string, unknown>;
        const channel = parsed.channel as { value?: unknown };
        expect(channel.value).toBe("stable");
      },
    },
  ] as const)("updateStatusCommand rendering: $name", runUpdateCliScenario);

  it("parses update status --json as the subcommand option", async () => {
    const program = new Command();
    program.name("openclaw");
    program.enablePositionalOptions();
    let seenJson = false;
    const update = program.command("update").option("--json", "", false);
    update
      .command("status")
      .option("--json", "", false)
      .action((opts) => {
        seenJson = Boolean(opts.json);
      });

    await program.parseAsync(["node", "openclaw", "update", "status", "--json"]);

    expect(seenJson).toBe(true);
  });

  it.each([
    {
      name: "defaults to dev channel for git installs when unset",
      mode: "git" as const,
      options: {},
      prepare: async () => {},
      expectedChannel: "dev" as const,
      expectedTag: undefined as string | undefined,
    },
    {
      name: "defaults to stable channel for package installs when unset",
      options: { yes: true },
      prepare: async () => {
        const tempDir = createCaseDir("openclaw-update");
        mockPackageInstallStatus(tempDir);
      },
      expectedChannel: undefined as "stable" | undefined,
      expectedTag: undefined as string | undefined,
    },
    {
      name: "uses stored beta channel when configured",
      mode: "git" as const,
      options: {},
      prepare: async () => {
        readConfigFileSnapshotMock.mockResolvedValue({
          ...baseSnapshot,
          config: { update: { channel: "beta" } } as OpenClawConfig,
        });
      },
      expectedChannel: "beta" as const,
      expectedTag: undefined as string | undefined,
    },
    {
      name: "switches git installs to package mode for explicit beta and persists it",
      mode: "git" as const,
      options: { channel: "beta" },
      prepare: async () => {},
      expectedChannel: undefined as string | undefined,
      expectedTag: undefined as string | undefined,
      expectedPersistedChannel: "beta" as const,
    },
  ])(
    "$name",
    async ({ mode, options, prepare, expectedChannel, expectedTag, expectedPersistedChannel }) => {
      await prepare();
      if (mode) {
        runGatewayUpdateMock.mockResolvedValue(makeOkUpdateResult({ mode }));
      }

      await updateCommand(options);

      if (expectedChannel !== undefined) {
        const call = expectUpdateCallChannel(expectedChannel);
        if (expectedTag !== undefined) {
          expect(call?.tag).toBe(expectedTag);
        }
      } else {
        expect(runGatewayUpdateMock).not.toHaveBeenCalled();
        expect(runCommandWithTimeoutMock).toHaveBeenCalledWith(
          ["npm", "i", "-g", "openclaw@latest", "--no-fund", "--no-audit", "--loglevel=error"],
          expect.any(Object),
        );
      }

      if (expectedPersistedChannel !== undefined) {
        expect(replaceConfigFileMock).toHaveBeenCalled();
        const writeCall = replaceConfigFileMock.mock.calls[0]?.[0] as
          | { nextConfig?: { update?: { channel?: string } } }
          | undefined;
        expect(writeCall?.nextConfig?.update?.channel).toBe(expectedPersistedChannel);
      }
    },
  );

  it("falls back to latest when beta tag is older than release", async () => {
    const tempDir = createCaseDir("openclaw-update");

    mockPackageInstallStatus(tempDir);
    readConfigFileSnapshotMock.mockResolvedValue({
      ...baseSnapshot,
      config: { update: { channel: "beta" } } as OpenClawConfig,
    });
    resolveNpmChannelTagMock.mockResolvedValue({
      tag: "latest",
      version: "1.2.3-1",
    });
    await updateCommand({});

    expect(runGatewayUpdateMock).not.toHaveBeenCalled();
    expect(runCommandWithTimeoutMock).toHaveBeenCalledWith(
      ["npm", "i", "-g", "openclaw@latest", "--no-fund", "--no-audit", "--loglevel=error"],
      expect.any(Object),
    );
  });

  it("blocks package updates when the target requires a newer Node runtime", async () => {
    mockPackageInstallStatus(createCaseDir("openclaw-update"));
    fetchNpmPackageTargetStatusMock.mockResolvedValue({
      target: "latest",
      version: "2026.3.23-2",
      nodeEngine: ">=22.14.0",
    });
    nodeVersionSatisfiesEngine.mockReturnValue(false);

    await updateCommand({ yes: true });

    expect(runGatewayUpdateMock).not.toHaveBeenCalled();
    expect(runCommandWithTimeoutMock).not.toHaveBeenCalledWith(
      ["npm", "i", "-g", "openclaw@latest", "--no-fund", "--no-audit", "--loglevel=error"],
      expect.any(Object),
    );
    expect(runtimeCapture.exit).toHaveBeenCalledWith(1);
    const errors = runtimeCapture.error.mock.calls.map((call) => String(call[0]));
    expect(errors.join("\n")).toContain("Node ");
    expect(errors.join("\n")).toContain(
      "Bare `npm i -g openclaw` can silently install an older compatible release.",
    );
  });

  it.each([
    {
      name: "explicit dist-tag",
      run: async () => {
        mockPackageInstallStatus(createCaseDir("openclaw-update"));
        await updateCommand({ tag: "next" });
      },
      expectedSpec: "openclaw@next",
    },
    {
      name: "main shorthand",
      run: async () => {
        mockPackageInstallStatus(createCaseDir("openclaw-update"));
        await updateCommand({ yes: true, tag: "main" });
      },
      expectedSpec: "github:openclaw/openclaw#main",
    },
    {
      name: "explicit git package spec",
      run: async () => {
        mockPackageInstallStatus(createCaseDir("openclaw-update"));
        await updateCommand({ yes: true, tag: "github:openclaw/openclaw#main" });
      },
      expectedSpec: "github:openclaw/openclaw#main",
    },
    {
      name: "OPENCLAW_UPDATE_PACKAGE_SPEC override",
      run: async () => {
        mockPackageInstallStatus(createCaseDir("openclaw-update"));
        await withEnvAsync(
          { OPENCLAW_UPDATE_PACKAGE_SPEC: "http://10.211.55.2:8138/openclaw-next.tgz" },
          async () => {
            await updateCommand({ yes: true, tag: "latest" });
          },
        );
      },
      expectedSpec: "http://10.211.55.2:8138/openclaw-next.tgz",
    },
  ] as const)(
    "resolves package install specs from tags and env overrides: $name",
    async ({ run, expectedSpec }) => {
      vi.clearAllMocks();
      readPackageName.mockResolvedValue("openclaw");
      readPackageVersion.mockResolvedValue("1.0.0");
      resolveGlobalManager.mockResolvedValue("npm");
      resolveOpenClawPackageRootMock.mockResolvedValue(process.cwd());
      await run();
      expectPackageInstallSpec(expectedSpec);
    },
  );

  it("fails package updates when the installed correction version does not match the requested target", async () => {
    const tempDir = createCaseDir("openclaw-update");
    const nodeModules = path.join(tempDir, "node_modules");
    const pkgRoot = path.join(nodeModules, "openclaw");
    mockPackageInstallStatus(tempDir);
    await fs.mkdir(pkgRoot, { recursive: true });
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ name: "openclaw", version: "2026.3.23" }),
      "utf-8",
    );
    for (const relativePath of BUNDLED_RUNTIME_SIDECAR_PATHS) {
      const absolutePath = path.join(pkgRoot, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, "export {};\n", "utf-8");
    }
    readPackageVersion.mockResolvedValue("2026.3.23");
    pathExists.mockImplementation(async (candidate: string) =>
      BUNDLED_RUNTIME_SIDECAR_PATHS.some(
        (relativePath) => candidate === path.join(pkgRoot, relativePath),
      ),
    );
    runCommandWithTimeoutMock.mockImplementation(async (argv) => {
      if (Array.isArray(argv) && argv[0] === "npm" && argv[1] === "root" && argv[2] === "-g") {
        return {
          stdout: nodeModules,
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
          termination: "exit",
        };
      }
      return {
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
        termination: "exit",
      };
    });

    await updateCommand({ yes: true, tag: "2026.3.23-2" });

    expect(runtimeCapture.exit).toHaveBeenCalledWith(1);
    expect(replaceConfigFileMock).not.toHaveBeenCalled();
    const logs = runtimeCapture.log.mock.calls.map((call) => String(call[0]));
    expect(logs.join("\n")).toContain("global install verify");
    expect(logs.join("\n")).toContain("expected installed version 2026.3.23-2, found 2026.3.23");
  });

  it("prepends portable Git PATH for package updates on Windows", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const tempDir = createCaseDir("openclaw-update");
    const localAppData = createCaseDir("openclaw-localappdata");
    const portableGitMingw = path.join(
      localAppData,
      "OpenClaw",
      "deps",
      "portable-git",
      "mingw64",
      "bin",
    );
    const portableGitUsr = path.join(
      localAppData,
      "OpenClaw",
      "deps",
      "portable-git",
      "usr",
      "bin",
    );
    await fs.mkdir(portableGitMingw, { recursive: true });
    await fs.mkdir(portableGitUsr, { recursive: true });
    mockPackageInstallStatus(tempDir);
    pathExists.mockImplementation(
      async (candidate: string) => candidate === portableGitMingw || candidate === portableGitUsr,
    );

    await withEnvAsync({ LOCALAPPDATA: localAppData }, async () => {
      await updateCommand({ yes: true });
    });

    platformSpy.mockRestore();

    const updateCall = vi
      .mocked(runCommandWithTimeout)
      .mock.calls.find(
        (call) =>
          Array.isArray(call[0]) &&
          call[0][0] === "npm" &&
          call[0][1] === "i" &&
          call[0][2] === "-g",
      );
    const updateOptions =
      typeof updateCall?.[1] === "object" && updateCall[1] !== null ? updateCall[1] : undefined;
    const mergedPath = updateOptions?.env?.Path ?? updateOptions?.env?.PATH ?? "";
    expect(mergedPath.split(path.delimiter).slice(0, 2)).toEqual([
      portableGitMingw,
      portableGitUsr,
    ]);
    expect(updateOptions?.env?.NPM_CONFIG_SCRIPT_SHELL).toBe("cmd.exe");
    expect(updateOptions?.env?.NODE_LLAMA_CPP_SKIP_DOWNLOAD).toBe("1");
  });

  it.each([
    {
      name: "outputs JSON when --json is set",
      run: async () => {
        runGatewayUpdateMock.mockResolvedValue(makeOkUpdateResult());
        runtimeCapture.writeJson.mockClear();
        await updateCommand({ json: true });
      },
      assert: () => {
        const jsonOutput = runtimeCapture.writeJson.mock.calls.at(-1)?.[0];
        expect(jsonOutput).toBeDefined();
      },
    },
    {
      name: "exits with error on failure",
      run: async () => {
        runGatewayUpdateMock.mockResolvedValue({
          status: "error",
          mode: "git",
          reason: "rebase-failed",
          steps: [],
          durationMs: 100,
        } satisfies UpdateRunResult);
        runtimeCapture.exit.mockClear();
        await updateCommand({});
      },
      assert: () => {
        expect(runtimeCapture.exit).toHaveBeenCalledWith(1);
      },
    },
  ] as const)("updateCommand reports outcomes: $name", runUpdateCliScenario);

  it("persists the requested channel only after a successful package update", async () => {
    const tempDir = createCaseDir("openclaw-update");
    mockPackageInstallStatus(tempDir);

    await updateCommand({ channel: "beta", yes: true });

    const installCallIndex = vi
      .mocked(runCommandWithTimeout)
      .mock.calls.findIndex(
        (call) =>
          Array.isArray(call[0]) &&
          call[0][0] === "npm" &&
          call[0][1] === "i" &&
          call[0][2] === "-g",
      );
    expect(installCallIndex).toBeGreaterThanOrEqual(0);
    expect(replaceConfigFileMock).toHaveBeenCalledTimes(1);
    expect(replaceConfigFileMock).toHaveBeenCalledWith({
      nextConfig: {
        update: {
          channel: "beta",
        },
      },
      baseHash: undefined,
    });
    expect(
      runCommandWithTimeoutMock.mock.invocationCallOrder[installCallIndex] ?? 0,
    ).toBeLessThan(
      replaceConfigFileMock.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("does not persist the requested channel when the package update fails", async () => {
    const tempDir = createCaseDir("openclaw-update");
    mockPackageInstallStatus(tempDir);
    runCommandWithTimeoutMock.mockImplementation(async (argv) => {
      if (Array.isArray(argv) && argv[0] === "npm" && argv[1] === "i" && argv[2] === "-g") {
        return {
          stdout: "",
          stderr: "install failed",
          code: 1,
          signal: null,
          killed: false,
          termination: "exit",
        };
      }
      return {
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
        termination: "exit",
      };
    });

    await updateCommand({ channel: "beta", yes: true });

    expect(replaceConfigFileMock).not.toHaveBeenCalled();
    expect(runtimeCapture.exit).toHaveBeenCalledWith(1);
  });

  it("keeps the requested channel when plugin sync writes config after update", async () => {
    const tempDir = createCaseDir("openclaw-update");
    mockPackageInstallStatus(tempDir);
    syncPluginsForUpdateChannel.mockImplementation(async ({ config }) => ({
      changed: true,
      config,
      summary: {
        switchedToBundled: [],
        switchedToNpm: [],
        warnings: [],
        errors: [],
      },
    }));
    updateNpmInstalledPlugins.mockImplementation(async ({ config }) => ({
      changed: false,
      config,
      outcomes: [],
    }));

    await updateCommand({ channel: "beta", yes: true });

    const lastWrite = replaceConfigFileMock.mock.calls.at(-1)?.[0] as
      | { nextConfig?: { update?: { channel?: string } } }
      | undefined;
    expect(lastWrite?.nextConfig?.update?.channel).toBe("beta");
  });

  it.each([
    {
      name: "refreshes service env when already installed",
      run: async () => {
        runGatewayUpdateMock.mockResolvedValue({
          status: "ok",
          mode: "git",
          steps: [],
          durationMs: 100,
        } satisfies UpdateRunResult);
        mockedRunDaemonInstall.mockResolvedValue(undefined);
        serviceLoaded.mockResolvedValue(true);

        await updateCommand({});
      },
      assert: () => {
        expect(mockedRunDaemonInstall).toHaveBeenCalledWith({
          force: true,
          json: undefined,
        });
        expect(runRestartScript).toHaveBeenCalled();
        expect(runDaemonRestartMock).not.toHaveBeenCalled();
      },
    },
    {
      name: "falls back to daemon restart when service env refresh cannot complete",
      run: async () => {
        runDaemonRestartMock.mockResolvedValue(true);
        await runRestartFallbackScenario({ daemonInstall: "fail" });
      },
      assert: () => {
        expect(mockedRunDaemonInstall).toHaveBeenCalledWith({
          force: true,
          json: undefined,
        });
        expect(runDaemonRestartMock).toHaveBeenCalled();
      },
    },
    {
      name: "keeps going when daemon install succeeds but restart fallback still handles relaunch",
      run: async () => {
        runDaemonRestartMock.mockResolvedValue(true);
        await runRestartFallbackScenario({ daemonInstall: "ok" });
      },
      assert: () => {
        expect(mockedRunDaemonInstall).toHaveBeenCalledWith({
          force: true,
          json: undefined,
        });
        expect(runDaemonRestartMock).toHaveBeenCalled();
      },
    },
    {
      name: "skips service env refresh when --no-restart is set",
      run: async () => {
        runGatewayUpdateMock.mockResolvedValue(makeOkUpdateResult());
        serviceLoaded.mockResolvedValue(true);

        await updateCommand({ restart: false });
      },
      assert: () => {
        expect(mockedRunDaemonInstall).not.toHaveBeenCalled();
        expect(runRestartScript).not.toHaveBeenCalled();
        expect(runDaemonRestartMock).not.toHaveBeenCalled();
      },
    },
    {
      name: "skips success message when restart does not run",
      run: async () => {
        runGatewayUpdateMock.mockResolvedValue(makeOkUpdateResult());
        runDaemonRestartMock.mockResolvedValue(false);
        runtimeCapture.log.mockClear();
        await updateCommand({ restart: true });
      },
      assert: () => {
        const logLines = runtimeCapture.log.mock.calls.map((call) => String(call[0]));
        expect(logLines.some((line) => line.includes("Daemon restarted successfully."))).toBe(
          false,
        );
      },
    },
  ] as const)("updateCommand service refresh behavior: $name", runUpdateCliScenario);

  it.each([
    {
      name: "updateCommand refreshes service env from updated install root when available",
      invoke: async () => {
        await updateCommand({});
      },
      expectedOptions: (root: string) => expect.objectContaining({ cwd: root, timeoutMs: 60_000 }),
      assertExtra: () => {
        expect(mockedRunDaemonInstall).not.toHaveBeenCalled();
        expect(runRestartScript).toHaveBeenCalled();
      },
    },
    {
      name: "updateCommand preserves invocation-relative service env overrides during refresh",
      invoke: async () => {
        await withEnvAsync(
          {
            OPENCLAW_STATE_DIR: "./state",
            OPENCLAW_CONFIG_PATH: "./config/openclaw.json",
          },
          async () => {
            await updateCommand({});
          },
        );
      },
      expectedOptions: (root: string) =>
        expect.objectContaining({
          cwd: root,
          env: expect.objectContaining({
            OPENCLAW_STATE_DIR: path.resolve("./state"),
            OPENCLAW_CONFIG_PATH: path.resolve("./config/openclaw.json"),
          }),
          timeoutMs: 60_000,
        }),
      assertExtra: () => {
        expect(mockedRunDaemonInstall).not.toHaveBeenCalled();
      },
    },
    {
      name: "updateCommand reuses the captured invocation cwd when process.cwd later fails",
      invoke: async () => {
        const originalCwd = process.cwd();
        let restoreCwd: (() => void) | undefined;
        const { root } = setupUpdatedRootRefresh({
          gatewayUpdateImpl: async () => {
            const cwdSpy = vi.spyOn(process, "cwd").mockImplementation(() => {
              throw new Error("ENOENT: current working directory is gone");
            });
            restoreCwd = () => cwdSpy.mockRestore();
            return {
              status: "ok",
              mode: "npm",
              root,
              steps: [],
              durationMs: 100,
            };
          },
        });
        try {
          await withEnvAsync(
            {
              OPENCLAW_STATE_DIR: "./state",
            },
            async () => {
              await updateCommand({});
            },
          );
        } finally {
          restoreCwd?.();
        }
        return { originalCwd };
      },
      customSetup: true,
      expectedOptions: (_root: string, context?: { originalCwd: string }) =>
        expect.objectContaining({
          cwd: expect.any(String),
          env: expect.objectContaining({
            OPENCLAW_STATE_DIR: path.resolve(context?.originalCwd ?? process.cwd(), "./state"),
          }),
          timeoutMs: 60_000,
        }),
      assertExtra: () => {
        expect(mockedRunDaemonInstall).not.toHaveBeenCalled();
      },
    },
  ])("$name", async (testCase) => {
    const setup = testCase.customSetup ? undefined : setupUpdatedRootRefresh();
    const context = (await testCase.invoke()) as { originalCwd: string } | undefined;
    const runCommandWithTimeoutCalls = runCommandWithTimeoutMock as unknown as {
      mock: { calls: Array<[unknown, { cwd?: string }?]> };
    };
    const root = setup?.root ?? runCommandWithTimeoutCalls.mock.calls[0]?.[1]?.cwd;
    const entryPath = setup?.entryPath ?? path.join(String(root), "dist", "entry.js");

    expect(runCommandWithTimeoutMock).toHaveBeenCalledWith(
      [expect.stringMatching(/node/), entryPath, "gateway", "install", "--force"],
      testCase.expectedOptions(String(root), context),
    );
    testCase.assertExtra();
  });

  it("updateCommand continues after doctor sub-step and clears update flag", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      await withEnvAsync({ OPENCLAW_UPDATE_IN_PROGRESS: undefined }, async () => {
        runGatewayUpdateMock.mockResolvedValue(makeOkUpdateResult());
        runDaemonRestartMock.mockResolvedValue(true);
        doctorCommandMock.mockResolvedValue(undefined);
        runtimeCapture.log.mockClear();

        await updateCommand({});

        expect(doctorCommandMock).toHaveBeenCalledWith(
          defaultRuntime,
          expect.objectContaining({ nonInteractive: true }),
        );
        expect(process.env.OPENCLAW_UPDATE_IN_PROGRESS).toBeUndefined();

        const logLines = runtimeCapture.log.mock.calls.map((call) => String(call[0]));
        expect(
          logLines.some((line) =>
            line.includes("Leveled up! New skills unlocked. You're welcome."),
          ),
        ).toBe(true);
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it.each([
    {
      name: "update command invalid timeout",
      run: async () => await updateCommand({ timeout: "invalid" }),
      requireTty: false,
      expectedError: "timeout",
    },
    {
      name: "update status command invalid timeout",
      run: async () => await updateStatusCommand({ timeout: "invalid" }),
      requireTty: false,
      expectedError: "timeout",
    },
    {
      name: "update wizard invalid timeout",
      run: async () => await updateWizardCommand({ timeout: "invalid" }),
      requireTty: true,
      expectedError: "timeout",
    },
    {
      name: "update wizard requires a TTY",
      run: async () => await updateWizardCommand({}),
      requireTty: false,
      expectedError: "Update wizard requires a TTY",
    },
  ] as const)(
    "validates update command invocation errors: $name",
    async ({ run, requireTty, expectedError, name }) => {
      setTty(requireTty);
      runtimeCapture.error.mockClear();
      runtimeCapture.exit.mockClear();

      await run();

      expect(runtimeCapture.error, name).toHaveBeenCalledWith(
        expect.stringContaining(expectedError),
      );
      expect(runtimeCapture.exit, name).toHaveBeenCalledWith(1);
    },
  );

  it.each([
    {
      name: "requires confirmation without --yes",
      options: {},
      shouldExit: true,
      shouldRunPackageUpdate: false,
    },
    {
      name: "allows downgrade with --yes",
      options: { yes: true },
      shouldExit: false,
      shouldRunPackageUpdate: true,
    },
  ])("$name in non-interactive mode", async ({ options, shouldExit, shouldRunPackageUpdate }) => {
    await setupNonInteractiveDowngrade();
    await updateCommand(options);

    const downgradeMessageSeen = runtimeCapture.error.mock.calls.some((call) =>
      String(call[0]).includes("Downgrade confirmation required."),
    );
    expect(downgradeMessageSeen).toBe(shouldExit);
    expect(runtimeCapture.exit.mock.calls.some((call) => call[0] === 1)).toBe(shouldExit);
    expect(runGatewayUpdateMock.mock.calls.length > 0).toBe(false);
    expect(
      vi
        .mocked(runCommandWithTimeout)
        .mock.calls.some((call) => Array.isArray(call[0]) && call[0][0] === "npm"),
    ).toBe(shouldRunPackageUpdate);
  });

  it("updateWizardCommand offers dev checkout and forwards selections", async () => {
    const tempDir = createCaseDir("openclaw-update-wizard");
    await withEnvAsync({ OPENCLAW_GIT_DIR: tempDir }, async () => {
      setTty(true);

      checkUpdateStatusMock.mockResolvedValue({
        root: "/test/path",
        installKind: "package",
        packageManager: "npm",
        deps: {
          manager: "npm",
          status: "ok",
          lockfilePath: null,
          markerPath: null,
        },
      });
      select.mockResolvedValue("dev");
      confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      runGatewayUpdateMock.mockResolvedValue({
        status: "ok",
        mode: "git",
        steps: [],
        durationMs: 100,
      });

      await updateWizardCommand({});

      const call = runGatewayUpdateMock.mock.calls[0]?.[0];
      expect(call?.channel).toBe("dev");
    });
  });

  it("uses ~/openclaw as the default dev checkout directory", async () => {
    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue("/tmp/oc-home");
    await withEnvAsync({ OPENCLAW_GIT_DIR: undefined }, async () => {
      expect(resolveGitInstallDir()).toBe(path.posix.join("/tmp/oc-home", "openclaw"));
    });
    homedirSpy.mockRestore();
  });
});
