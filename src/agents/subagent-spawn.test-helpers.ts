import os from "node:os";
import { expect, vi } from "vitest";
import type { SubagentLifecycleHookRunner } from "../plugins/hooks.js";

type MockFn = (...args: unknown[]) => unknown;
type MockImplementationTarget = {
  mockImplementation: (implementation: (opts: { method?: string }) => Promise<unknown>) => unknown;
};
type SessionStore = Record<string, Record<string, unknown>>;
type SessionStoreMutator = (store: SessionStore) => unknown;
type HookRunner = Pick<SubagentLifecycleHookRunner, "hasHooks" | "runSubagentSpawning">;

const subagentSpawnTestRuntime = vi.hoisted(() => ({
  callGatewayMock: undefined as MockFn | undefined,
  loadConfig: undefined as (() => Record<string, unknown>) | undefined,
  updateSessionStoreMock: undefined as MockFn | undefined,
  pruneLegacyStoreKeysMock: undefined as MockFn | undefined,
  registerSubagentRunMock: undefined as MockFn | undefined,
  emitSessionLifecycleEventMock: undefined as MockFn | undefined,
  hookRunner: undefined as HookRunner | undefined,
  resolveAgentConfig: undefined as
    | ((cfg: Record<string, unknown>, agentId: string) => unknown)
    | undefined,
  resolveAgentWorkspaceDir: undefined as
    | ((cfg: Record<string, unknown>, agentId: string) => string)
    | undefined,
  resolveSubagentSpawnModelSelection: undefined as (() => string | undefined) | undefined,
  resolveSandboxRuntimeStatus: undefined as (() => { sandboxed: boolean }) | undefined,
  workspaceDir: undefined as string | undefined,
  sessionStorePath: undefined as string | undefined,
}));

export function createSubagentSpawnTestConfig(
  workspaceDir = os.tmpdir(),
  overrides?: Record<string, unknown>,
) {
  return {
    session: {
      mainKey: "main",
      scope: "per-sender",
    },
    tools: {
      sessions_spawn: {
        attachments: {
          enabled: true,
          maxFiles: 50,
          maxFileBytes: 1 * 1024 * 1024,
          maxTotalBytes: 5 * 1024 * 1024,
        },
      },
    },
    agents: {
      defaults: {
        workspace: workspaceDir,
      },
    },
    ...overrides,
  };
}

export function setupAcceptedSubagentGatewayMock(callGatewayMock: MockImplementationTarget) {
  callGatewayMock.mockImplementation(async (opts: { method?: string }) => {
    if (opts.method === "sessions.patch") {
      return { ok: true };
    }
    if (opts.method === "sessions.delete") {
      return { ok: true };
    }
    if (opts.method === "agent") {
      return { runId: "run-1", status: "accepted", acceptedAt: 1000 };
    }
    return {};
  });
}

export function identityDeliveryContext(value: unknown) {
  return value;
}

export function createDefaultSessionHelperMocks() {
  return {
    resolveMainSessionAlias: () => ({ mainKey: "main", alias: "main" }),
    resolveInternalSessionKey: ({ key }: { key?: string }) => key ?? "agent:main:main",
    resolveDisplaySessionKey: ({ key }: { key?: string }) => key ?? "agent:main:main",
  };
}

export function installSessionStoreCaptureMock(
  updateSessionStoreMock: {
    mockImplementation: (
      implementation: (storePath: string, mutator: SessionStoreMutator) => Promise<SessionStore>,
    ) => unknown;
  },
  params?: {
    operations?: string[];
    onStore?: (store: SessionStore) => void;
  },
) {
  updateSessionStoreMock.mockImplementation(
    async (_storePath: string, mutator: SessionStoreMutator) => {
      params?.operations?.push("store:update");
      const store: SessionStore = {};
      await mutator(store);
      params?.onStore?.(store);
      return store;
    },
  );
}

export function expectPersistedRuntimeModel(params: {
  persistedStore: SessionStore | undefined;
  sessionKey: string | RegExp;
  provider: string;
  model: string;
}) {
  const [persistedKey, persistedEntry] = Object.entries(params.persistedStore ?? {})[0] ?? [];
  if (typeof params.sessionKey === "string") {
    expect(persistedKey).toBe(params.sessionKey);
  } else {
    expect(persistedKey).toMatch(params.sessionKey);
  }
  expect(persistedEntry).toMatchObject({
    modelProvider: params.provider,
    model: params.model,
  });
}

import * as subagentRegistry from "./subagent-registry.js";
import * as subagentSpawnModule from "./subagent-spawn.js";

export async function loadSubagentSpawnModuleForTest(params: {
  callGatewayMock: MockFn;
  loadConfig?: () => Record<string, unknown>;
  updateSessionStoreMock?: MockFn;
  pruneLegacyStoreKeysMock?: MockFn;
  registerSubagentRunMock?: MockFn;
  emitSessionLifecycleEventMock?: MockFn;
  hookRunner?: HookRunner;
  resolveAgentConfig?: (cfg: Record<string, unknown>, agentId: string) => unknown;
  resolveAgentWorkspaceDir?: (cfg: Record<string, unknown>, agentId: string) => string;
  resolveSubagentSpawnModelSelection?: () => string | undefined;
  resolveSandboxRuntimeStatus?: () => { sandboxed: boolean };
  workspaceDir?: string;
  sessionStorePath?: string;
}) {
  subagentSpawnTestRuntime.callGatewayMock = params.callGatewayMock;
  subagentSpawnTestRuntime.loadConfig = params.loadConfig;
  subagentSpawnTestRuntime.updateSessionStoreMock = params.updateSessionStoreMock;
  subagentSpawnTestRuntime.pruneLegacyStoreKeysMock = params.pruneLegacyStoreKeysMock;
  subagentSpawnTestRuntime.registerSubagentRunMock = params.registerSubagentRunMock;
  subagentSpawnTestRuntime.emitSessionLifecycleEventMock = params.emitSessionLifecycleEventMock;
  subagentSpawnTestRuntime.hookRunner = params.hookRunner;
  subagentSpawnTestRuntime.resolveAgentConfig = params.resolveAgentConfig;
  subagentSpawnTestRuntime.resolveAgentWorkspaceDir = params.resolveAgentWorkspaceDir;
  subagentSpawnTestRuntime.resolveSubagentSpawnModelSelection =
    params.resolveSubagentSpawnModelSelection;
  subagentSpawnTestRuntime.resolveSandboxRuntimeStatus = params.resolveSandboxRuntimeStatus;
  subagentSpawnTestRuntime.workspaceDir = params.workspaceDir;
  subagentSpawnTestRuntime.sessionStorePath = params.sessionStorePath;
  const loadConfig =
    params.loadConfig ??
    (() => createSubagentSpawnTestConfig(subagentSpawnTestRuntime.workspaceDir ?? os.tmpdir()));
  subagentSpawnModule.__testing.setDepsForTest({
    callGateway: (opts) => subagentSpawnTestRuntime.callGatewayMock?.(opts) ?? {},
    getGlobalHookRunner: () => subagentSpawnTestRuntime.hookRunner ?? { hasHooks: () => false },
    loadConfig,
    updateSessionStore: (...args) =>
      subagentSpawnTestRuntime.updateSessionStoreMock?.(...args) ?? Promise.resolve({}),
    resolveGatewaySessionStoreTarget: (targetParams) => ({
      agentId: "main",
      storePath:
        subagentSpawnTestRuntime.sessionStorePath ?? "/tmp/subagent-spawn-model-session.json",
      canonicalKey: targetParams.key,
      storeKeys: [targetParams.key],
    }),
    pruneLegacyStoreKeys: (args) =>
      subagentSpawnTestRuntime.pruneLegacyStoreKeysMock?.(args),
    resolveMainSessionAlias: () => ({ mainKey: "main", alias: "main" }),
    resolveInternalSessionKey: ({ key }) => key ?? "agent:main:main",
    resolveDisplaySessionKey: ({ key }) => key ?? "agent:main:main",
    getSubagentDepthFromSessionStore: () => 0,
    resolveAgentConfig: (cfg, agentId) => subagentSpawnTestRuntime.resolveAgentConfig?.(cfg, agentId),
    resolveSandboxRuntimeStatus: () =>
      subagentSpawnTestRuntime.resolveSandboxRuntimeStatus?.() ?? { sandboxed: false },
    resolveSubagentSpawnModelSelection: (selectionParams) =>
      subagentSpawnTestRuntime.resolveSubagentSpawnModelSelection?.() ??
      (typeof selectionParams.modelOverride === "string" && selectionParams.modelOverride.trim()
        ? selectionParams.modelOverride.trim()
        : (() => {
            const configuredAgentModel = selectionParams.cfg?.agents?.list?.find(
              (agent) => agent.id === selectionParams.agentId && typeof agent.model === "string",
            )?.model;
            if (typeof configuredAgentModel === "string" && configuredAgentModel.trim()) {
              return configuredAgentModel.trim();
            }
            const configuredDefaultModel = selectionParams.cfg?.agents?.defaults?.model;
            if (typeof configuredDefaultModel === "string" && configuredDefaultModel.trim()) {
              return configuredDefaultModel.trim();
            }
            return "anthropic/claude-sonnet-4.6";
          })()),
    resolveSpawnedWorkspaceInheritance: (inheritParams) =>
      inheritParams.explicitWorkspaceDir?.trim() ||
      (inheritParams.targetAgentId
        ? subagentSpawnTestRuntime.resolveAgentWorkspaceDir?.(
            inheritParams.config,
            inheritParams.targetAgentId,
          ) ??
          subagentSpawnTestRuntime.workspaceDir ??
          os.tmpdir()
        : undefined),
    buildSubagentSystemPrompt: () => "system-prompt",
    registerSubagentRun: (args) =>
      subagentSpawnTestRuntime.registerSubagentRunMock?.(args),
    emitSessionLifecycleEvent: (args) =>
      subagentSpawnTestRuntime.emitSessionLifecycleEventMock?.(args),
  });
  return {
    ...subagentSpawnModule,
    resetSubagentRegistryForTests: subagentRegistry.resetSubagentRegistryForTests,
  };
}
