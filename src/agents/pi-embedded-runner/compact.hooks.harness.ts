import { getApiProvider } from "@mariozechner/pi-ai";
import { vi, type Mock } from "vitest";
import { ensureCustomApiRegistered } from "../custom-api-registry.js";

type MockResolvedModel = {
  model: { provider: string; api: string; id: string; input: unknown[] };
  error: null;
  authStorage: { setRuntimeApiKey: Mock<(provider?: string, apiKey?: string) => void> };
  modelRegistry: Record<string, never>;
};
type MockMemorySearchManager = {
  manager: {
    sync: (params?: unknown) => Promise<void>;
  };
};

const hoistedMemoryRuntime = vi.hoisted(() => ({
  getMemorySearchManagerMock: vi.fn(async () => ({
    manager: {
      sync: vi.fn(async (_params?: unknown) => {}),
    },
  })),
  resolveMemorySearchConfigMock: vi.fn(() => ({
    sources: ["sessions"],
    sync: {
      sessions: {
        postCompactionForce: true,
      },
    },
  })),
}));

export const contextEngineCompactMock = vi.fn(async () => ({
  ok: true as boolean,
  compacted: true as boolean,
  reason: undefined as string | undefined,
  result: { summary: "engine-summary", tokensAfter: 50 } as
    | { summary: string; tokensAfter: number }
    | undefined,
}));

export const hookRunner = {
  hasHooks: vi.fn<(hookName?: string) => boolean>(),
  runBeforeCompaction: vi.fn(async () => undefined),
  runAfterCompaction: vi.fn(async () => undefined),
};

export const ensureRuntimePluginsLoaded: Mock<(params?: unknown) => void> = vi.fn();
export const resolveContextEngineMock = vi.fn(async () => ({
  info: { ownsCompaction: true as boolean },
  compact: contextEngineCompactMock,
}));
export const resolveModelMock: Mock<
  (provider?: string, modelId?: string, agentDir?: string, cfg?: unknown) => MockResolvedModel
> = vi.fn((_provider?: string, _modelId?: string, _agentDir?: string, _cfg?: unknown) => ({
  model: { provider: "openai", api: "responses", id: "fake", input: [] },
  error: null,
  authStorage: { setRuntimeApiKey: vi.fn() },
  modelRegistry: {},
}));
export const sessionCompactImpl = vi.fn(async () => ({
  summary: "summary",
  firstKeptEntryId: "entry-1",
  tokensBefore: 120,
  details: { ok: true },
}));
export const triggerInternalHook: Mock<(event?: unknown) => void> = vi.fn();
export const sanitizeSessionHistoryMock = vi.fn(
  async (params: { messages: unknown[] }) => params.messages,
);
export const getMemorySearchManagerMock = hoistedMemoryRuntime.getMemorySearchManagerMock as Mock<
  (params?: unknown) => Promise<MockMemorySearchManager>
>;
export const resolveMemorySearchConfigMock = hoistedMemoryRuntime.resolveMemorySearchConfigMock;
export const resolveSessionAgentIdMock = vi.fn(() => "main");
export const estimateTokensMock = vi.fn((_message?: unknown) => 10);
export const sessionMessages: unknown[] = [
  { role: "user", content: "hello", timestamp: 1 },
  { role: "assistant", content: [{ type: "text", text: "hi" }], timestamp: 2 },
  {
    role: "toolResult",
    toolCallId: "t1",
    toolName: "exec",
    content: [{ type: "text", text: "output" }],
    isError: false,
    timestamp: 3,
  },
];
export const sessionAbortCompactionMock: Mock<(reason?: unknown) => void> = vi.fn();
export const createOpenClawCodingToolsMock = vi.fn(() => []);
export const prepareProviderRuntimeAuthMock = vi.fn(async () => undefined);
export const registerProviderStreamForModelMock = vi.fn();
export const transcriptListeners = new Set<(update: unknown) => void>();

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => hookRunner,
}));

vi.mock("../runtime-plugins.js", () => ({
  ensureRuntimePluginsLoaded,
}));

vi.mock("../../plugins/provider-runtime.js", () => ({
  prepareProviderRuntimeAuth: prepareProviderRuntimeAuthMock,
  resolveProviderCapabilitiesWithPlugin: vi.fn(() => undefined),
  prepareProviderExtraParams: vi.fn(() => undefined),
  resolveProviderStreamFn: vi.fn(() => vi.fn(async () => undefined)),
  wrapProviderStreamFn: vi.fn((streamFn: unknown) => streamFn),
  buildProviderMissingAuthMessageWithPlugin: vi.fn(() => undefined),
  resolveProviderSyntheticAuthWithPlugin: vi.fn(() => undefined),
}));

vi.mock("../../auto-reply/heartbeat.js", () => ({
  resolveHeartbeatPrompt: vi.fn(() => undefined),
  stripHeartbeatToken: vi.fn((text: string) => {
    const stripped = text.replace(/<b>HEARTBEAT_OK<\/b>/g, "").trim();
    return {
      didStrip: stripped !== text.trim(),
      text: stripped,
    };
  }),
}));

vi.mock("../../auto-reply/tokens.js", () => ({
  isSilentReplyText: vi.fn((text: string) => text.trim() === "NO_REPLY"),
}));

vi.mock("../../hooks/internal-hooks.js", () => ({
  createInternalHookEvent: vi.fn(
    (type: string, action: string, sessionKey: string | undefined, context?: unknown) => ({
      type,
      action,
      sessionKey,
      context,
    }),
  ),
  triggerInternalHook,
}));

vi.mock("@mariozechner/pi-ai/oauth", () => ({
  getOAuthApiKey: vi.fn(),
  getOAuthProviders: vi.fn(() => []),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  AuthStorage: class AuthStorage {},
  ModelRegistry: class ModelRegistry {},
  createAgentSession: vi.fn(async () => {
    const session = {
      sessionId: "session-1",
      messages: sessionMessages.map((message) =>
        typeof structuredClone === "function"
          ? structuredClone(message)
          : JSON.parse(JSON.stringify(message)),
      ),
      agent: {
        replaceMessages: vi.fn((messages: unknown[]) => {
          session.messages = [...(messages as typeof session.messages)];
        }),
        streamFn: vi.fn(),
      },
      compact: vi.fn(async () => {
        session.messages.splice(1);
        return await sessionCompactImpl();
      }),
      abortCompaction: sessionAbortCompactionMock,
      dispose: vi.fn(),
    };
    return { session };
  }),
  DefaultResourceLoader: class DefaultResourceLoader {},
  SessionManager: {
    open: vi.fn(() => ({})),
  },
  SettingsManager: {
    create: vi.fn(() => ({})),
  },
  estimateTokens: estimateTokensMock,
}));

vi.mock("../session-tool-result-guard-wrapper.js", () => ({
  guardSessionManager: vi.fn(() => ({
    flushPendingToolResults: vi.fn(),
  })),
}));

vi.mock("../pi-settings.js", () => ({
  ensurePiCompactionReserveTokens: vi.fn(),
  resolveCompactionReserveTokensFloor: vi.fn(() => 0),
}));

vi.mock("../models-config.js", () => ({
  ensureOpenClawModelsJson: vi.fn(async () => {}),
}));

vi.mock("../model-auth.js", () => ({
  applyLocalNoAuthHeaderOverride: vi.fn((model: unknown) => model),
  getApiKeyForModel: vi.fn(async () => ({ apiKey: "test", mode: "env" })),
  resolveModelAuthMode: vi.fn(() => "env"),
  resolveEnvApiKey: vi.fn(() => null),
  resolveUsableCustomProviderApiKey: vi.fn(() => null),
}));

vi.mock("../sandbox.js", () => ({
  resolveSandboxContext: vi.fn(async () => null),
}));

vi.mock("../session-file-repair.js", () => ({
  repairSessionFileIfNeeded: vi.fn(async () => {}),
}));

vi.mock("../session-write-lock.js", () => ({
  acquireSessionWriteLock: vi.fn(async () => ({ release: vi.fn(async () => {}) })),
  drainSessionWriteLockStateForTest: vi.fn(async () => {}),
  resolveSessionLockMaxHoldFromTimeout: vi.fn(() => 0),
}));

vi.mock("../../context-engine/index.js", () => ({
  ensureContextEnginesInitialized: vi.fn(),
  resolveContextEngine: resolveContextEngineMock,
}));

vi.mock("../../process/command-queue.js", () => ({
  enqueueCommandInLane: vi.fn((_lane: unknown, task: () => unknown) => task()),
  clearCommandLane: vi.fn(() => 0),
}));

vi.mock("../../routing/session-key.js", () => ({
  isCronSessionKey: vi.fn(() => false),
  isSubagentSessionKey: vi.fn(() => false),
}));

vi.mock("../../infra/secure-random.js", () => ({
  generateSecureToken: vi.fn(() => "secure-token"),
}));

vi.mock("./lanes.js", () => ({
  resolveSessionLane: vi.fn(() => "test-session-lane"),
  resolveGlobalLane: vi.fn(() => "test-global-lane"),
}));

vi.mock("../context-window-guard.js", () => ({
  resolveContextWindowInfo: vi.fn(() => ({ tokens: 128_000 })),
}));

vi.mock("../bootstrap-files.js", () => ({
  makeBootstrapWarn: vi.fn(() => () => {}),
  resolveBootstrapContextForRun: vi.fn(async () => ({ contextFiles: [] })),
}));

vi.mock("../pi-bundle-mcp-tools.js", () => ({
  createBundleMcpToolRuntime: vi.fn(async () => ({
    tools: [],
    dispose: vi.fn(async () => {}),
  })),
}));

vi.mock("../pi-bundle-lsp-runtime.js", () => ({
  createBundleLspToolRuntime: vi.fn(async () => ({
    tools: [],
    sessions: [],
    dispose: vi.fn(async () => {}),
  })),
}));

vi.mock("../docs-path.js", () => ({
  resolveOpenClawDocsPath: vi.fn(async () => undefined),
}));

vi.mock("../channel-tools.js", () => ({
  listChannelSupportedActions: vi.fn(() => undefined),
  resolveChannelMessageToolCapabilities: vi.fn(() => undefined),
  resolveChannelMessageToolHints: vi.fn(() => undefined),
  resolveChannelReactionGuidance: vi.fn(() => undefined),
}));

vi.mock("../pi-tools.js", () => ({
  createOpenClawCodingTools: createOpenClawCodingToolsMock,
}));

vi.mock("../provider-stream.js", () => ({
  registerProviderStreamForModel: registerProviderStreamForModelMock,
}));

vi.mock("./google.js", () => ({
  logToolSchemasForGoogle: vi.fn(),
  sanitizeSessionHistory: sanitizeSessionHistoryMock,
  sanitizeToolsForGoogle: vi.fn(({ tools }: { tools: unknown[] }) => tools),
}));

vi.mock("./tool-split.js", () => ({
  splitSdkTools: vi.fn(() => ({ builtInTools: [], customTools: [] })),
}));

vi.mock("./compaction-safety-timeout.js", () => ({
  compactWithSafetyTimeout: vi.fn(
    async (
      compact: () => Promise<unknown>,
      _timeoutMs?: number,
      opts?: { abortSignal?: AbortSignal; onCancel?: () => void },
    ) => {
      const abortSignal = opts?.abortSignal;
      if (!abortSignal) {
        return await compact();
      }
      const cancelAndCreateError = () => {
        opts?.onCancel?.();
        const reason = "reason" in abortSignal ? abortSignal.reason : undefined;
        if (reason instanceof Error) {
          return reason;
        }
        const err = new Error("aborted");
        err.name = "AbortError";
        return err;
      };
      if (abortSignal.aborted) {
        throw cancelAndCreateError();
      }
      return await Promise.race([
        compact(),
        new Promise<never>((_, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => {
              reject(cancelAndCreateError());
            },
            { once: true },
          );
        }),
      ]);
    },
  ),
  resolveCompactionTimeoutMs: vi.fn(() => 30_000),
}));

vi.mock("./wait-for-idle-before-flush.js", () => ({
  flushPendingToolResultsAfterIdle: vi.fn(async () => {}),
}));

vi.mock("../transcript-policy.js", () => ({
  resolveTranscriptPolicy: vi.fn(() => ({
    allowSyntheticToolResults: false,
    validateGeminiTurns: false,
    validateAnthropicTurns: false,
  })),
}));

vi.mock("./extensions.js", () => ({
  buildEmbeddedExtensionFactories: vi.fn(() => ({ factories: [] })),
}));

vi.mock("./history.js", () => ({
  getDmHistoryLimitFromSessionKey: vi.fn(() => undefined),
  limitHistoryTurns: vi.fn((msgs: unknown[]) => msgs.slice(0, 2)),
}));

vi.mock("../skills.js", () => ({
  applySkillEnvOverrides: vi.fn(() => () => {}),
  applySkillEnvOverridesFromSnapshot: vi.fn(() => () => {}),
  loadWorkspaceSkillEntries: vi.fn(() => []),
  resolveSkillsPromptForRun: vi.fn(() => undefined),
}));

vi.mock("../agent-paths.js", () => ({
  resolveOpenClawAgentDir: vi.fn(() => "/tmp"),
}));

vi.mock("../agent-scope.js", () => ({
  resolveSessionAgentId: resolveSessionAgentIdMock,
  resolveSessionAgentIds: vi.fn(() => ({ defaultAgentId: "main", sessionAgentId: "main" })),
}));

vi.mock("../memory-search.js", () => ({
  resolveMemorySearchConfig: resolveMemorySearchConfigMock,
}));

vi.mock("../date-time.js", () => ({
  formatUserTime: vi.fn(() => ""),
  resolveUserTimeFormat: vi.fn(() => ""),
  resolveUserTimezone: vi.fn(() => ""),
}));

vi.mock("../defaults.js", () => ({
  DEFAULT_MODEL: "fake-model",
  DEFAULT_PROVIDER: "openai",
  DEFAULT_CONTEXT_TOKENS: 128_000,
}));

vi.mock("../../utils.js", () => ({
  resolveUserPath: vi.fn((p: string) => p),
  isPlainObject: vi.fn(
    (value: unknown) =>
      typeof value === "object" && value !== null && !Array.isArray(value),
  ),
}));

vi.mock("../../infra/machine-name.js", () => ({
  getMachineDisplayName: vi.fn(async () => "machine"),
}));

vi.mock("../../config/channel-capabilities.js", () => ({
  resolveChannelCapabilities: vi.fn(() => undefined),
}));

vi.mock("../../utils/message-channel.js", () => ({
  normalizeMessageChannel: vi.fn(() => undefined),
}));

vi.mock("../../utils/provider-utils.js", () => ({
  isReasoningTagProvider: vi.fn(() => false),
}));

vi.mock("../../tts/tts.js", () => ({
  buildTtsSystemPromptHint: vi.fn(() => undefined),
}));

vi.mock("../../sessions/transcript-events.js", () => ({
  onSessionTranscriptUpdate: vi.fn((listener: (update: unknown) => void) => {
    transcriptListeners.add(listener);
    return () => {
      transcriptListeners.delete(listener);
    };
  }),
  emitSessionTranscriptUpdate: vi.fn((update: unknown) => {
    const nextUpdate =
      typeof update === "string"
        ? { sessionFile: update.trim() }
        : (update as { sessionFile?: string });
    if (!nextUpdate.sessionFile?.trim()) {
      return;
    }
    for (const listener of transcriptListeners) {
      try {
        listener(nextUpdate);
      } catch {
        // Ignore listener failures in tests.
      }
    }
  }),
}));

vi.mock("../pi-embedded-helpers.js", () => ({
  ensureSessionHeader: vi.fn(async () => {}),
  validateAnthropicTurns: vi.fn((m: unknown[]) => m),
  validateGeminiTurns: vi.fn((m: unknown[]) => m),
}));

vi.mock("../pi-project-settings.js", () => ({
  createPreparedEmbeddedPiSettingsManager: vi.fn(() => ({
    getGlobalSettings: vi.fn(() => ({})),
  })),
}));

vi.mock("../pi-extensions/compaction-safeguard-runtime.js", () => ({
  consumeCompactionSafeguardCancelReason: vi.fn(() => null),
  setCompactionSafeguardCancelReason: vi.fn(),
}));

vi.mock("../owner-display.js", () => ({
  resolveOwnerDisplaySetting: vi.fn(() => ({
    ownerDisplay: undefined,
    ownerDisplaySecret: undefined,
  })),
}));

vi.mock("../model-tool-support.js", () => ({
  supportsModelTools: vi.fn(() => true),
}));

vi.mock("../session-transcript-repair.js", () => ({
  sanitizeToolUseResultPairing: vi.fn((messages: unknown[]) => messages),
}));

vi.mock("../shell-utils.js", () => ({
  detectRuntimeShell: vi.fn(() => undefined),
}));

vi.mock("./sandbox-info.js", () => ({
  buildEmbeddedSandboxInfo: vi.fn(() => undefined),
}));

vi.mock("./logger.js", () => ({
  log: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    raw: vi.fn(),
    child: vi.fn(),
    isEnabled: vi.fn(() => false),
    subsystem: "agent/embedded",
  },
}));

vi.mock("./compact-reasons.js", () => ({
  classifyCompactionReason: vi.fn(() => "context-window"),
  resolveCompactionFailureReason: vi.fn(
    (params?: { reason?: string; safeguardCancelReason?: string }) =>
      params?.safeguardCancelReason ?? params?.reason,
  ),
}));

vi.mock("./message-action-discovery-input.js", () => ({
  buildEmbeddedMessageActionDiscoveryInput: vi.fn(() => undefined),
}));

vi.mock("./model.js", () => ({
  buildModelAliasLines: vi.fn(() => []),
  resolveModel: resolveModelMock,
  resolveModelAsync: vi.fn(
    async (provider: string, modelId: string, agentDir?: string, cfg?: unknown) =>
      resolveModelMock(provider, modelId, agentDir, cfg),
  ),
}));

vi.mock("./session-manager-cache.js", () => ({
  prewarmSessionFile: vi.fn(async () => {}),
  trackSessionManagerAccess: vi.fn(),
}));

vi.mock("./session-truncation.js", () => ({
  truncateSessionAfterCompaction: vi.fn(async () => undefined),
}));

vi.mock("./skills-runtime.js", () => ({
  resolveEmbeddedRunSkillEntries: vi.fn(async () => []),
}));

vi.mock("./system-prompt.js", () => ({
  applySystemPromptOverrideToSession: vi.fn(),
  buildEmbeddedSystemPrompt: vi.fn(() => ""),
  createSystemPromptOverride: vi.fn(() => () => ""),
}));

vi.mock("./utils.js", () => ({
  describeUnknownError: vi.fn((err: unknown) => String(err)),
  mapThinkingLevel: vi.fn(() => "off"),
  resolveExecToolDefaults: vi.fn(() => undefined),
}));

vi.mock("./tool-name-allowlist.js", () => ({
  collectAllowedToolNames: vi.fn(() => []),
}));

export function resetCompactSessionStateMocks(): void {
  sanitizeSessionHistoryMock.mockReset();
  sanitizeSessionHistoryMock.mockImplementation(async (params: { messages: unknown[] }) => {
    return params.messages;
  });

  getMemorySearchManagerMock.mockReset();
  getMemorySearchManagerMock.mockResolvedValue({
    manager: {
      sync: vi.fn(async () => {}),
    },
  });
  resolveMemorySearchConfigMock.mockReset();
  resolveMemorySearchConfigMock.mockReturnValue({
    sources: ["sessions"],
    sync: {
      sessions: {
        postCompactionForce: true,
      },
    },
  });
  resolveSessionAgentIdMock.mockReset();
  resolveSessionAgentIdMock.mockReturnValue("main");
  estimateTokensMock.mockReset();
  estimateTokensMock.mockReturnValue(10);
  sessionMessages.splice(
    0,
    sessionMessages.length,
    { role: "user", content: "hello", timestamp: 1 },
    { role: "assistant", content: [{ type: "text", text: "hi" }], timestamp: 2 },
    {
      role: "toolResult",
      toolCallId: "t1",
      toolName: "exec",
      content: [{ type: "text", text: "output" }],
      isError: false,
      timestamp: 3,
    },
  );
  sessionAbortCompactionMock.mockReset();
}

export function resetCompactHooksHarnessMocks(): void {
  transcriptListeners.clear();
  hookRunner.hasHooks.mockReset();
  hookRunner.hasHooks.mockReturnValue(false);
  hookRunner.runBeforeCompaction.mockReset();
  hookRunner.runBeforeCompaction.mockResolvedValue(undefined);
  hookRunner.runAfterCompaction.mockReset();
  hookRunner.runAfterCompaction.mockResolvedValue(undefined);

  ensureRuntimePluginsLoaded.mockReset();

  resolveContextEngineMock.mockReset();
  resolveContextEngineMock.mockResolvedValue({
    info: { ownsCompaction: true },
    compact: contextEngineCompactMock,
  });
  contextEngineCompactMock.mockReset();
  contextEngineCompactMock.mockResolvedValue({
    ok: true,
    compacted: true,
    reason: undefined,
    result: { summary: "engine-summary", tokensAfter: 50 },
  });

  resolveModelMock.mockReset();
  resolveModelMock.mockReturnValue({
    model: { provider: "openai", api: "responses", id: "fake", input: [] },
    error: null,
    authStorage: { setRuntimeApiKey: vi.fn() },
    modelRegistry: {},
  });

  sessionCompactImpl.mockReset();
  sessionCompactImpl.mockResolvedValue({
    summary: "summary",
    firstKeptEntryId: "entry-1",
    tokensBefore: 120,
    details: { ok: true },
  });

  triggerInternalHook.mockReset();
  resetCompactSessionStateMocks();
  createOpenClawCodingToolsMock.mockReset();
  createOpenClawCodingToolsMock.mockReturnValue([]);
  prepareProviderRuntimeAuthMock.mockReset();
  prepareProviderRuntimeAuthMock.mockResolvedValue(undefined);
  registerProviderStreamForModelMock.mockReset();
  registerProviderStreamForModelMock.mockImplementation((params?: unknown) => {
    const modelApi = (params as { model?: { api?: string } } | undefined)?.model?.api;
    if (typeof modelApi === "string" && !getApiProvider(modelApi as never)) {
      ensureCustomApiRegistered(modelApi as never, vi.fn(async () => undefined) as never);
    }
    return vi.fn(async () => undefined);
  });
}

export async function loadCompactHooksHarness(): Promise<{
  compactEmbeddedPiSessionDirect: typeof import("./compact.js").compactEmbeddedPiSessionDirect;
  compactEmbeddedPiSession: typeof import("./compact.js").compactEmbeddedPiSession;
  __testing: typeof import("./compact.js").__testing;
  onSessionTranscriptUpdate: typeof import("../../sessions/transcript-events.js").onSessionTranscriptUpdate;
}> {
  resetCompactHooksHarnessMocks();
  const compactModule = await import("./compact.js");
  const transcriptEvents = await import("../../sessions/transcript-events.js");

  return {
    ...compactModule,
    onSessionTranscriptUpdate: transcriptEvents.onSessionTranscriptUpdate,
  };
}
