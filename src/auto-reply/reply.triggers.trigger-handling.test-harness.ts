import { join } from "node:path";
import { afterEach, vi } from "vitest";
import type { MockFn } from "../test-utils/vitest-mock-fn.js";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";

type AnyMock = MockFn<(...args: unknown[]) => unknown>;
type AnyMockMap = Record<string, MockFn>;

const piEmbeddedMocks = vi.hoisted(() => ({
  abortEmbeddedPiRun: vi.fn<(...args: unknown[]) => boolean>().mockReturnValue(false),
  compactEmbeddedPiSession: vi.fn<(...args: unknown[]) => unknown>(),
  runEmbeddedPiAgent: vi.fn<(...args: unknown[]) => unknown>(),
  queueEmbeddedPiMessage: vi.fn<(...args: unknown[]) => boolean>().mockReturnValue(false),
  isEmbeddedPiRunActive: vi.fn<(...args: unknown[]) => boolean>().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn<(...args: unknown[]) => boolean>().mockReturnValue(false),
}));

export function getAbortEmbeddedPiRunMock(): AnyMock {
  return piEmbeddedMocks.abortEmbeddedPiRun;
}

export function getCompactEmbeddedPiSessionMock(): AnyMock {
  return piEmbeddedMocks.compactEmbeddedPiSession;
}

export function getRunEmbeddedPiAgentMock(): AnyMock {
  return piEmbeddedMocks.runEmbeddedPiAgent;
}

export function getQueueEmbeddedPiMessageMock(): AnyMock {
  return piEmbeddedMocks.queueEmbeddedPiMessage;
}

vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: (...args: unknown[]) => piEmbeddedMocks.abortEmbeddedPiRun(...args),
  compactEmbeddedPiSession: (...args: unknown[]) =>
    piEmbeddedMocks.compactEmbeddedPiSession(...args),
  runEmbeddedPiAgent: (...args: unknown[]) => piEmbeddedMocks.runEmbeddedPiAgent(...args),
  queueEmbeddedPiMessage: (...args: unknown[]) => piEmbeddedMocks.queueEmbeddedPiMessage(...args),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: (...args: unknown[]) => piEmbeddedMocks.isEmbeddedPiRunActive(...args),
  isEmbeddedPiRunStreaming: (...args: unknown[]) =>
    piEmbeddedMocks.isEmbeddedPiRunStreaming(...args),
}));

const providerUsageMocks = vi.hoisted(() => ({
  loadProviderUsageSummary: vi.fn().mockResolvedValue({
    updatedAt: 0,
    providers: [],
  }),
  formatUsageSummaryLine: vi
    .fn<(...args: unknown[]) => string>()
    .mockReturnValue("📊 Usage: Claude 80% left"),
  formatUsageWindowSummary: vi
    .fn<(...args: unknown[]) => string>()
    .mockReturnValue("Claude 80% left"),
  resolveUsageProviderId: vi.fn<(provider: string) => string>(
    (provider: string) => provider.split("/")[0],
  ),
}));

export function getProviderUsageMocks(): AnyMockMap {
  return providerUsageMocks;
}

vi.mock("../infra/provider-usage.js", () => providerUsageMocks);

const modelCatalogMocks = vi.hoisted(() => ({
  loadModelCatalog: vi.fn().mockResolvedValue([
    {
      provider: "anthropic",
      id: "claude-opus-4-5",
      name: "Claude Opus 4.5",
      contextWindow: 200000,
    },
    {
      provider: "openrouter",
      id: "anthropic/claude-opus-4-5",
      name: "Claude Opus 4.5 (OpenRouter)",
      contextWindow: 200000,
    },
    { provider: "openai", id: "gpt-4.1-mini", name: "GPT-4.1 mini" },
    { provider: "openai", id: "gpt-5.2", name: "GPT-5.2" },
    { provider: "openai-codex", id: "gpt-5.2", name: "GPT-5.2 (Codex)" },
    { provider: "minimax", id: "MiniMax-M2.1", name: "MiniMax M2.1" },
  ]),
  resetModelCatalogCacheForTest: vi.fn<(...args: unknown[]) => unknown>(),
}));

export function getModelCatalogMocks(): AnyMockMap {
  return modelCatalogMocks;
}

vi.mock("../agents/model-catalog.js", () => modelCatalogMocks);

const webSessionMocks = vi.hoisted(() => ({
  webAuthExists: vi.fn().mockResolvedValue(true),
  getWebAuthAgeMs: vi.fn().mockReturnValue(120_000),
  readWebSelfId: vi.fn().mockReturnValue({ e164: "+1999" }),
}));

export function getWebSessionMocks(): AnyMockMap {
  return webSessionMocks;
}

vi.mock("../web/session.js", () => webSessionMocks);

export const MAIN_SESSION_KEY = "agent:main:main";

export async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(
    async (home) => {
      // Avoid cross-test leakage if a test doesn't touch these mocks.
      piEmbeddedMocks.runEmbeddedPiAgent.mockClear();
      piEmbeddedMocks.abortEmbeddedPiRun.mockClear();
      piEmbeddedMocks.compactEmbeddedPiSession.mockClear();
      return await fn(home);
    },
    { prefix: "openclaw-triggers-" },
  );
}

export function makeCfg(home: string) {
  return {
    agents: {
      defaults: {
        model: "anthropic/claude-opus-4-5",
        workspace: join(home, "openclaw"),
      },
    },
    channels: {
      whatsapp: {
        allowFrom: ["*"],
      },
    },
    session: { store: join(home, "sessions.json") },
  };
}

export function installTriggerHandlingE2eTestHooks() {
  afterEach(() => {
    vi.restoreAllMocks();
  });
}
