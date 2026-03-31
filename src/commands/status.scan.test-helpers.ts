import path from "node:path";
import { vi } from "vitest";
import type { OpenClawConfig } from "../config/types.js";
import { resolveSharedMemoryStatusSnapshot } from "./status.scan.shared.js";

export function createStatusScanSharedMocks(configPathLabel: string) {
  return {
    resolveConfigPath: vi.fn(() => `/tmp/openclaw-${configPathLabel}-missing-${process.pid}.json`),
    hasPotentialConfiguredChannels: vi.fn(),
    readBestEffortConfig: vi.fn(),
    resolveCommandSecretRefsViaGateway: vi.fn(),
    getUpdateCheckResult: vi.fn(),
    getAgentLocalStatuses: vi.fn(),
    getStatusSummary: vi.fn(),
    getMemorySearchManager: vi.fn(),
    buildGatewayConnectionDetails: vi.fn(),
    probeGateway: vi.fn(),
    resolveGatewayProbeAuthResolution: vi.fn(),
    ensurePluginRegistryLoaded: vi.fn(),
    buildPluginCompatibilityNotices: vi.fn(() => []),
  };
}

export type StatusScanSharedMocks = ReturnType<typeof createStatusScanSharedMocks>;

export function createStatusOsSummaryModuleMock() {
  return {
    resolveOsSummary: vi.fn(() => ({ label: "test-os" })),
  };
}

export function createStatusScanDepsRuntimeModuleMock(
  mocks: Pick<StatusScanSharedMocks, "getMemorySearchManager">,
) {
  return {
    getTailnetHostname: vi.fn(),
    getMemorySearchManager: mocks.getMemorySearchManager,
  };
}

export function createStatusGatewayProbeModuleMock(
  mocks: Pick<StatusScanSharedMocks, "resolveGatewayProbeAuthResolution">,
) {
  return {
    pickGatewaySelfPresence: vi.fn(() => null),
    resolveGatewayProbeAuthResolution: mocks.resolveGatewayProbeAuthResolution,
  };
}

export function createStatusGatewayCallModuleMock(
  mocks: Pick<StatusScanSharedMocks, "buildGatewayConnectionDetails"> & {
    callGateway?: unknown;
  },
) {
  return {
    buildGatewayConnectionDetails: mocks.buildGatewayConnectionDetails,
    ...(mocks.callGateway ? { callGateway: mocks.callGateway } : {}),
  };
}

export function createStatusPluginRegistryModuleMock(
  mocks: Pick<StatusScanSharedMocks, "ensurePluginRegistryLoaded">,
) {
  return {
    ensurePluginRegistryLoaded: mocks.ensurePluginRegistryLoaded,
  };
}

export function createStatusPluginStatusModuleMock(
  mocks: Pick<StatusScanSharedMocks, "buildPluginCompatibilityNotices">,
) {
  return {
    buildPluginCompatibilityNotices: mocks.buildPluginCompatibilityNotices,
  };
}

export function createStatusUpdateModuleMock(
  mocks: Pick<StatusScanSharedMocks, "getUpdateCheckResult">,
) {
  return {
    getUpdateCheckResult: mocks.getUpdateCheckResult,
  };
}

export function createStatusAgentLocalModuleMock(
  mocks: Pick<StatusScanSharedMocks, "getAgentLocalStatuses">,
) {
  return {
    getAgentLocalStatuses: mocks.getAgentLocalStatuses,
  };
}

export function createStatusSummaryModuleMock(
  mocks: Pick<StatusScanSharedMocks, "getStatusSummary">,
) {
  return {
    getStatusSummary: mocks.getStatusSummary,
  };
}

export function createStatusExecModuleMock() {
  return {
    runExec: vi.fn(),
  };
}

type StatusScanModuleTestMocks = StatusScanSharedMocks & {
  buildChannelsTable?: ReturnType<typeof vi.fn>;
  callGateway?: ReturnType<typeof vi.fn>;
  getStatusCommandSecretTargetIds?: ReturnType<typeof vi.fn>;
  resolveMemorySearchConfig?: ReturnType<typeof vi.fn>;
};

export async function loadStatusScanModuleForTest(
  mocks: StatusScanModuleTestMocks,
  options: {
    fastJson: true;
  },
): Promise<typeof import("./status.scan.fast-json.js")>;
export async function loadStatusScanModuleForTest(
  mocks: StatusScanModuleTestMocks,
  options?: {
    fastJson?: false;
  },
): Promise<typeof import("./status.scan.js")>;
export async function loadStatusScanModuleForTest(
  mocks: StatusScanModuleTestMocks,
  options: {
    fastJson?: boolean;
  } = {},
) {
  const mockModule = (specifier: string, factory: () => unknown) => {
    vi.doMock(specifier, factory);
    if (specifier.endsWith(".js")) {
      vi.doMock(`${specifier.slice(0, -3)}.ts`, factory);
    }
  };

  vi.resetModules();

  if (options.fastJson) {
    const [coreModule, fastJsonModule] = await Promise.all([
      import("./status.scan.json-core.js"),
      import("./status.scan.fast-json.js"),
    ]);
    coreModule.__testing.resetDepsForTest();
    fastJsonModule.__testing.resetDepsForTest();
    coreModule.__testing.setDepsForTest({
      ensurePluginRegistryLoaded: async (options) => {
        mocks.ensurePluginRegistryLoaded(options);
      },
      getUpdateCheckResult: async (params) => await mocks.getUpdateCheckResult(params),
      getAgentLocalStatuses: async (cfg) => await mocks.getAgentLocalStatuses(cfg),
      getStatusSummary: async (params) => await mocks.getStatusSummary(params),
      getTailnetHostname: async () => null,
      resolveGatewayProbeSnapshot: async ({ cfg, opts }) => ({
        gatewayConnection: mocks.buildGatewayConnectionDetails({ config: cfg }),
        remoteUrlMissing: false,
        gatewayMode: "local" as const,
        gatewayProbeAuth: {},
        gatewayProbeAuthWarning: undefined,
        gatewayProbe: opts?.skipProbe ? null : await mocks.probeGateway(),
      }),
    });
    fastJsonModule.__testing.setDepsForTest({
      readStatusSourceConfig: async () => await mocks.readBestEffortConfig(),
      resolveStatusConfig: async ({ sourceConfig, commandName }) =>
        await mocks.resolveCommandSecretRefsViaGateway({
          config: sourceConfig,
          commandName,
          targetIds: mocks.getStatusCommandSecretTargetIds?.() ?? [],
          mode: "read_only_status",
        }),
      hasPotentialConfiguredChannels: mocks.hasPotentialConfiguredChannels,
      resolveOsSummary: createStatusOsSummaryModuleMock().resolveOsSummary,
      resolveMemoryStatusSnapshot: async ({ cfg, agentStatus, memoryPlugin }) =>
        await resolveSharedMemoryStatusSnapshot({
          cfg,
          agentStatus,
          memoryPlugin,
          resolveMemoryConfig: mocks.resolveMemorySearchConfig!,
          getMemorySearchManager: mocks.getMemorySearchManager,
          requireDefaultStore: () => null,
        }),
    });
    return fastJsonModule;
  }

  mockModule("../channels/config-presence.js", () => ({
    hasPotentialConfiguredChannels: mocks.hasPotentialConfiguredChannels,
  }));

  {
    mockModule("../cli/progress.js", () => ({
      withProgress: vi.fn(async (_opts, run) => await run({ setLabel: vi.fn(), tick: vi.fn() })),
    }));
    mockModule("../config/config.js", () => ({
      readBestEffortConfig: mocks.readBestEffortConfig,
    }));
    mockModule("./status-all/channels.js", () => ({
      buildChannelsTable: mocks.buildChannelsTable,
    }));
    mockModule("./status.scan.runtime.js", () => ({
      statusScanRuntime: {
        buildChannelsTable: mocks.buildChannelsTable,
        collectChannelStatusIssues: vi.fn(() => []),
      },
    }));
  }

  mockModule("../config/paths.js", () => {
    return {
      resolveConfigPath: mocks.resolveConfigPath,
      resolveStateDir: vi.fn(
        (_env: NodeJS.ProcessEnv, homedir?: string | (() => string)) =>
          path.join(typeof homedir === "function" ? homedir() : (homedir ?? "/tmp"), ".openclaw"),
      ),
      resolveDefaultConfigCandidates: vi.fn(() => []),
    };
  });

  mockModule("../cli/command-secret-gateway.js", () => ({
    resolveCommandSecretRefsViaGateway: mocks.resolveCommandSecretRefsViaGateway,
  }));
  mockModule("./status.update.js", () => createStatusUpdateModuleMock(mocks));
  mockModule("./status.agent-local.js", () => createStatusAgentLocalModuleMock(mocks));
  mockModule("./status.summary.js", () => createStatusSummaryModuleMock(mocks));
  mockModule("../infra/os-summary.js", () => createStatusOsSummaryModuleMock());
  mockModule("./status.scan.deps.runtime.js", () => createStatusScanDepsRuntimeModuleMock(mocks));
  mockModule("../gateway/call.js", () => createStatusGatewayCallModuleMock(mocks));
  mockModule("../gateway/probe.js", () => ({
    probeGateway: mocks.probeGateway,
  }));
  mockModule("./status.gateway-probe.js", () => createStatusGatewayProbeModuleMock(mocks));
  mockModule("../gateway/connection-details.js", () => ({
    buildGatewayConnectionDetails: mocks.buildGatewayConnectionDetails,
    buildGatewayConnectionDetailsWithResolvers: mocks.buildGatewayConnectionDetails,
  }));
  mockModule("../process/exec.js", () => createStatusExecModuleMock());
  mockModule("../cli/plugin-registry.js", () => createStatusPluginRegistryModuleMock(mocks));
  mockModule("../plugins/status.js", () => createStatusPluginStatusModuleMock(mocks));

  return await import("./status.scan.js");
}

export function createStatusScanConfig<T extends object = OpenClawConfig>(
  overrides: T = {} as T,
): OpenClawConfig & T {
  return {
    session: {},
    gateway: {},
    ...overrides,
  } as OpenClawConfig & T;
}

export function createStatusSummary(
  options: {
    linkChannel?: { linked: boolean };
    byAgent?: unknown[];
  } = {},
) {
  return {
    linkChannel: options.linkChannel,
    tasks: {
      total: 0,
      active: 0,
      terminal: 0,
      failures: 0,
      byStatus: {
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        timed_out: 0,
        cancelled: 0,
        lost: 0,
      },
      byRuntime: {
        subagent: 0,
        acp: 0,
        cli: 0,
        cron: 0,
      },
    },
    sessions: {
      count: 0,
      paths: [],
      defaults: {},
      recent: [],
      ...(Object.prototype.hasOwnProperty.call(options, "byAgent")
        ? { byAgent: options.byAgent ?? [] }
        : {}),
    },
  };
}

export function createStatusUpdateResult() {
  return {
    installKind: "git",
    git: null,
    registry: null,
  };
}

export function createStatusAgentLocalStatuses() {
  return {
    defaultId: "main",
    agents: [],
  };
}

export function createStatusGatewayConnection() {
  return {
    url: "ws://127.0.0.1:18789",
    urlSource: "default",
  };
}

export function createStatusGatewayProbeFailure() {
  return {
    ok: false,
    url: "ws://127.0.0.1:18789",
    connectLatencyMs: null,
    error: "timeout",
    close: null,
    health: null,
    status: null,
    presence: null,
    configSnapshot: null,
  };
}

export function createStatusMemorySearchConfig(): OpenClawConfig {
  return createStatusScanConfig({
    agents: {
      defaults: {
        memorySearch: {
          provider: "local",
          local: { modelPath: "/tmp/model.gguf" },
          fallback: "none",
        },
      },
    },
  });
}

export function createStatusMemorySearchManager() {
  return {
    manager: {
      probeVectorAvailability: vi.fn(async () => true),
      status: vi.fn(() => ({ files: 0, chunks: 0, dirty: false })),
      close: vi.fn(async () => {}),
    },
  };
}

export function applyStatusScanDefaults(
  mocks: StatusScanSharedMocks,
  options: {
    hasConfiguredChannels?: boolean;
    sourceConfig?: OpenClawConfig;
    resolvedConfig?: OpenClawConfig;
    summary?: ReturnType<typeof createStatusSummary>;
    update?: ReturnType<typeof createStatusUpdateResult> | false;
    gatewayProbe?: ReturnType<typeof createStatusGatewayProbeFailure> | false;
    memoryManager?: ReturnType<typeof createStatusMemorySearchManager>;
  } = {},
) {
  const sourceConfig = options.sourceConfig ?? createStatusScanConfig();
  const resolvedConfig = options.resolvedConfig ?? sourceConfig;

  mocks.hasPotentialConfiguredChannels.mockReturnValue(options.hasConfiguredChannels ?? false);
  mocks.readBestEffortConfig.mockResolvedValue(sourceConfig);
  mocks.resolveCommandSecretRefsViaGateway.mockResolvedValue({
    resolvedConfig,
    diagnostics: [],
  });
  mocks.getAgentLocalStatuses.mockResolvedValue(createStatusAgentLocalStatuses());
  mocks.getStatusSummary.mockResolvedValue(options.summary ?? createStatusSummary());
  mocks.buildGatewayConnectionDetails.mockReturnValue(createStatusGatewayConnection());
  mocks.resolveGatewayProbeAuthResolution.mockResolvedValue({
    auth: {},
    warning: undefined,
  });
  mocks.ensurePluginRegistryLoaded.mockImplementation(() => {});
  mocks.buildPluginCompatibilityNotices.mockReturnValue([]);

  if (options.update !== false) {
    mocks.getUpdateCheckResult.mockResolvedValue(options.update ?? createStatusUpdateResult());
  }

  if (options.gatewayProbe !== false) {
    mocks.probeGateway.mockResolvedValue(options.gatewayProbe ?? createStatusGatewayProbeFailure());
  }

  if (options.memoryManager) {
    mocks.getMemorySearchManager.mockResolvedValue(options.memoryManager);
  }
}

export async function withTemporaryEnv(
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>,
) {
  const previousEntries = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previousEntries)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
