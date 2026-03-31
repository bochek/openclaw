import { vi, type Mock } from "vitest";
import type { SubagentLifecycleHookRunner } from "../plugins/hooks.js";
import {
  __testing as subagentAnnounceDeliveryTesting,
  resolveRequesterStoreKey,
} from "./subagent-announce-delivery.js";
import { __testing as subagentAnnounceOutputTesting } from "./subagent-announce-output.js";
import {
  __testing as subagentAnnounceTesting,
  captureSubagentCompletionReply,
  runSubagentAnnounceFlow,
} from "./subagent-announce.js";
import { __testing as subagentRegistryTesting } from "./subagent-registry.js";
import { __testing as subagentSpawnTesting } from "./subagent-spawn.js";

type SessionsSpawnTestConfig = ReturnType<(typeof import("../config/config.js"))["loadConfig"]>;
type SessionsSpawnHookRunner = SubagentLifecycleHookRunner | null;
type CreateSessionsSpawnTool =
  (typeof import("./tools/sessions-spawn-tool.js"))["createSessionsSpawnTool"];
type SessionsSpawnTool = ReturnType<CreateSessionsSpawnTool>;

export type CreateOpenClawToolsOpts = Parameters<CreateSessionsSpawnTool>[0];
export type GatewayRequest = { method?: string; params?: unknown };
export type AgentWaitCall = { runId?: string; timeoutMs?: number };

type SessionsSpawnGatewayMockOptions = {
  runIdPrefix?: string;
  includeSessionsList?: boolean;
  includeChatHistory?: boolean;
  chatHistoryText?: string;
  onAgentSubagentSpawn?: (params: unknown) => void;
  onSessionsPatch?: (params: unknown) => void;
  onSessionsDelete?: (params: unknown) => void;
  agentWaitResult?: { status: "ok" | "timeout"; startedAt: number; endedAt: number };
};

type SessionsSpawnHarnessState = {
  callGatewayMock: Mock;
  defaultConfigOverride: SessionsSpawnTestConfig;
  configOverride: SessionsSpawnTestConfig;
  hookRunnerOverride: SessionsSpawnHookRunner;
  defaultRunSubagentAnnounceFlow: typeof runSubagentAnnounceFlow;
  runSubagentAnnounceFlowOverride: typeof runSubagentAnnounceFlow;
};

type SessionsSpawnTestHarness = {
  getCallGatewayMock(): Mock;
  getGatewayRequests(): Array<GatewayRequest>;
  getGatewayMethods(): Array<string | undefined>;
  findGatewayRequest(method: string): GatewayRequest | undefined;
  resetSessionsSpawnConfigOverride(): void;
  setSessionsSpawnConfigOverride(next: SessionsSpawnTestConfig): void;
  resetSessionsSpawnAnnounceFlowOverride(): void;
  resetSessionsSpawnHookRunnerOverride(): void;
  setSessionsSpawnHookRunnerOverride(next: SessionsSpawnHookRunner): void;
  setSessionsSpawnAnnounceFlowOverride(next: typeof runSubagentAnnounceFlow): void;
  loadConfig(): SessionsSpawnTestConfig;
  runWithSessionsSpawnDeps<T>(fn: () => T): T;
  getSessionsSpawnTool(opts: CreateOpenClawToolsOpts): Promise<SessionsSpawnTool>;
  setupSessionsSpawnGatewayMock(setupOpts: SessionsSpawnGatewayMockOptions): {
    calls: Array<GatewayRequest>;
    waitCalls: Array<AgentWaitCall>;
    getChild: () => { runId?: string; sessionKey?: string };
  };
};

function runWithHarnessDeps<T>(state: SessionsSpawnHarnessState, fn: () => T): T {
  const spawnDeps = {
    callGateway: (optsUnknown: unknown) => state.callGatewayMock(optsUnknown),
    getGlobalHookRunner: () => state.hookRunnerOverride,
    loadConfig: () => state.configOverride,
    updateSessionStore: async (_storePath: string, mutator: (store: Record<string, unknown>) => unknown) =>
      mutator({}),
  };
  const announceDeps = {
    callGateway: (optsUnknown: unknown) => state.callGatewayMock(optsUnknown),
    loadConfig: () => state.configOverride,
  };
  const registryDeps = {
    callGateway: (optsUnknown: unknown) => state.callGatewayMock(optsUnknown),
    loadConfig: () => state.configOverride,
    captureSubagentCompletionReply,
    runSubagentAnnounceFlow: (params: Parameters<typeof runSubagentAnnounceFlow>[0]) =>
      state.runSubagentAnnounceFlowOverride(params),
  };

  return subagentSpawnTesting.runWithDepsForTest(spawnDeps, () =>
    subagentAnnounceTesting.runWithDepsForTest(announceDeps, () =>
      subagentAnnounceDeliveryTesting.runWithDepsForTest(announceDeps, () =>
        subagentAnnounceOutputTesting.runWithDepsForTest(announceDeps, () =>
          subagentRegistryTesting.runWithDepsForTest(registryDeps, fn),
        ),
      ),
    ),
  );
}

export function createSessionsSpawnTestHarness(): SessionsSpawnTestHarness {
  const harnessId = Math.random().toString(36).slice(2, 10);
  const callGatewayMock = vi.fn();
  const defaultConfigOverride = {
    session: {
      mainKey: "main",
      scope: "per-sender",
    },
  } as SessionsSpawnTestConfig;
  const state: SessionsSpawnHarnessState = {
    callGatewayMock,
    defaultConfigOverride,
    configOverride: defaultConfigOverride,
    hookRunnerOverride: null,
    defaultRunSubagentAnnounceFlow: async (params) => {
      const statusLabel =
        params.outcome?.status === "timeout" ? "timed out" : "completed successfully";
      const requesterSessionKey = resolveRequesterStoreKey(
        state.configOverride,
        params.requesterSessionKey,
      );

      await state.callGatewayMock({
        method: "agent",
        params: {
          sessionKey: requesterSessionKey,
          message: `subagent task ${statusLabel}`,
          deliver: false,
        },
      });

      if (params.label) {
        await state.callGatewayMock({
          method: "sessions.patch",
          params: {
            key: params.childSessionKey,
            label: params.label,
          },
        });
      }

      if (params.cleanup === "delete") {
        await state.callGatewayMock({
          method: "sessions.delete",
          params: {
            key: params.childSessionKey,
            deleteTranscript: true,
            emitLifecycleHooks: params.spawnMode === "session",
          },
        });
      }

      return true;
    },
    runSubagentAnnounceFlowOverride: async () => true,
  };
  state.runSubagentAnnounceFlowOverride = state.defaultRunSubagentAnnounceFlow;

  return {
    getCallGatewayMock() {
      return state.callGatewayMock;
    },
    getGatewayRequests() {
      return state.callGatewayMock.mock.calls.map((call: unknown[]) => call[0] as GatewayRequest);
    },
    getGatewayMethods() {
      return this.getGatewayRequests().map((request) => request.method);
    },
    findGatewayRequest(method: string) {
      return this.getGatewayRequests().find((request) => request.method === method);
    },
    resetSessionsSpawnConfigOverride() {
      state.configOverride = state.defaultConfigOverride;
    },
    setSessionsSpawnConfigOverride(next: SessionsSpawnTestConfig) {
      state.configOverride = next;
    },
    resetSessionsSpawnAnnounceFlowOverride() {
      state.runSubagentAnnounceFlowOverride = state.defaultRunSubagentAnnounceFlow;
    },
    resetSessionsSpawnHookRunnerOverride() {
      state.hookRunnerOverride = null;
    },
    setSessionsSpawnHookRunnerOverride(next: SessionsSpawnHookRunner) {
      state.hookRunnerOverride = next;
    },
    setSessionsSpawnAnnounceFlowOverride(next: typeof runSubagentAnnounceFlow) {
      state.runSubagentAnnounceFlowOverride = next;
    },
    loadConfig() {
      return state.configOverride;
    },
    runWithSessionsSpawnDeps<T>(fn: () => T): T {
      return runWithHarnessDeps(state, fn);
    },
    async getSessionsSpawnTool(opts: CreateOpenClawToolsOpts) {
      const { createSessionsSpawnTool } = await import("./tools/sessions-spawn-tool.js");
      const tool = createSessionsSpawnTool(opts);
      return {
        ...tool,
        execute: async (...args: Parameters<SessionsSpawnTool["execute"]>) =>
          await runWithHarnessDeps(state, () => tool.execute(...args)),
      };
    },
    setupSessionsSpawnGatewayMock(setupOpts: SessionsSpawnGatewayMockOptions) {
      const calls: Array<GatewayRequest> = [];
      const waitCalls: Array<AgentWaitCall> = [];
      let agentCallCount = 0;
      let childRunId: string | undefined;
      let childSessionKey: string | undefined;

      state.callGatewayMock.mockImplementation(async (optsUnknown: unknown) => {
        const request = optsUnknown as GatewayRequest;
        calls.push(request);

        if (request.method === "sessions.list" && setupOpts.includeSessionsList) {
          return {
            sessions: [
              {
                key: "main",
                lastChannel: "whatsapp",
                lastTo: "+123",
              },
            ],
          };
        }

        if (request.method === "agent") {
          agentCallCount += 1;
          const runId = `${setupOpts.runIdPrefix ?? `run-${harnessId}`}-${agentCallCount}`;
          const params = request.params as { lane?: string; sessionKey?: string } | undefined;
          if (params?.lane === "subagent") {
            childRunId = runId;
            childSessionKey = params.sessionKey ?? "";
            setupOpts.onAgentSubagentSpawn?.(params);
          }
          return {
            runId,
            status: "accepted",
            acceptedAt: 1000 + agentCallCount,
          };
        }

        if (request.method === "agent.wait") {
          const params = request.params as AgentWaitCall | undefined;
          waitCalls.push(params ?? {});
          const waitResult = setupOpts.agentWaitResult ?? {
            status: "ok",
            startedAt: 1000,
            endedAt: 2000,
          };
          return {
            runId: params?.runId ?? `${setupOpts.runIdPrefix ?? `run-${harnessId}`}-1`,
            ...waitResult,
          };
        }

        if (request.method === "sessions.patch") {
          setupOpts.onSessionsPatch?.(request.params);
          return { ok: true };
        }

        if (request.method === "sessions.delete") {
          setupOpts.onSessionsDelete?.(request.params);
          return { ok: true };
        }

        if (request.method === "chat.history" && setupOpts.includeChatHistory) {
          return {
            messages: [
              {
                role: "assistant",
                content: [{ type: "text", text: setupOpts.chatHistoryText ?? "done" }],
              },
            ],
          };
        }

        return {};
      });

      return {
        calls,
        waitCalls,
        getChild: () => ({ runId: childRunId, sessionKey: childSessionKey }),
      };
    },
  };
}

const defaultSessionsSpawnHarness = createSessionsSpawnTestHarness();

export function getCallGatewayMock(): Mock {
  return defaultSessionsSpawnHarness.getCallGatewayMock();
}

export function getGatewayRequests(): Array<GatewayRequest> {
  return defaultSessionsSpawnHarness.getGatewayRequests();
}

export function getGatewayMethods(): Array<string | undefined> {
  return defaultSessionsSpawnHarness.getGatewayMethods();
}

export function findGatewayRequest(method: string): GatewayRequest | undefined {
  return defaultSessionsSpawnHarness.findGatewayRequest(method);
}

export function resetSessionsSpawnConfigOverride(): void {
  defaultSessionsSpawnHarness.resetSessionsSpawnConfigOverride();
}

export function setSessionsSpawnConfigOverride(next: SessionsSpawnTestConfig): void {
  defaultSessionsSpawnHarness.setSessionsSpawnConfigOverride(next);
}

export function resetSessionsSpawnAnnounceFlowOverride(): void {
  defaultSessionsSpawnHarness.resetSessionsSpawnAnnounceFlowOverride();
}

export function resetSessionsSpawnHookRunnerOverride(): void {
  defaultSessionsSpawnHarness.resetSessionsSpawnHookRunnerOverride();
}

export function setSessionsSpawnHookRunnerOverride(next: SessionsSpawnHookRunner): void {
  defaultSessionsSpawnHarness.setSessionsSpawnHookRunnerOverride(next);
}

export function setSessionsSpawnAnnounceFlowOverride(next: typeof runSubagentAnnounceFlow): void {
  defaultSessionsSpawnHarness.setSessionsSpawnAnnounceFlowOverride(next);
}

export function loadSessionsSpawnHarnessConfig(): SessionsSpawnTestConfig {
  return defaultSessionsSpawnHarness.loadConfig();
}

export function runWithSessionsSpawnDeps<T>(fn: () => T): T {
  return defaultSessionsSpawnHarness.runWithSessionsSpawnDeps(fn);
}

export async function getSessionsSpawnTool(opts: CreateOpenClawToolsOpts) {
  return await defaultSessionsSpawnHarness.getSessionsSpawnTool(opts);
}

export function setupSessionsSpawnGatewayMock(setupOpts: SessionsSpawnGatewayMockOptions) {
  return defaultSessionsSpawnHarness.setupSessionsSpawnGatewayMock(setupOpts);
}
