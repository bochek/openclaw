import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { TemplateContext } from "../templating.js";
import type { GetReplyOptions } from "../types.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const hoisted = vi.hoisted(() => {
  const getRuntimeConfigSnapshotMock = vi.fn();
  const runPreflightCompactionIfNeededMock = vi.fn();
  const runMemoryFlushIfNeededMock = vi.fn();
  const runAgentTurnWithFallbackMock = vi.fn();
  return {
    getRuntimeConfigSnapshotMock,
    runPreflightCompactionIfNeededMock,
    runMemoryFlushIfNeededMock,
    runAgentTurnWithFallbackMock,
  };
});

vi.mock("../../config/config.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../config/config.js")>("../../config/config.js");
  return {
    ...actual,
    getRuntimeConfigSnapshot: () => hoisted.getRuntimeConfigSnapshotMock(),
  };
});

vi.mock("./agent-runner-memory.js", () => ({
  runPreflightCompactionIfNeeded: (params: unknown) =>
    hoisted.runPreflightCompactionIfNeededMock(params),
  runMemoryFlushIfNeeded: (params: unknown) => hoisted.runMemoryFlushIfNeededMock(params),
}));

vi.mock("./agent-runner-execution.js", () => ({
  runAgentTurnWithFallback: (params: unknown) => hoisted.runAgentTurnWithFallbackMock(params),
}));

const { runReplyAgent } = await import("./agent-runner.js");

function makeFollowupRun(config: Record<string, unknown>): FollowupRun {
  return {
    prompt: "yo",
    summaryLine: "yo",
    enqueuedAt: Date.now(),
    run: {
      sessionId: "session-1",
      sessionKey: "agent:main:telegram",
      agentId: "main",
      messageProvider: "telegram",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp/workspace",
      config,
      skillsSnapshot: {},
      provider: "openai-codex",
      model: "gpt-5.4",
      thinkLevel: "medium",
      verboseLevel: "off",
      reasoningLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 30_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
}

function runDirectReply(params: {
  followupRun: FollowupRun;
  opts?: GetReplyOptions;
  sessionEntry?: SessionEntry;
}) {
  return runReplyAgent({
    commandBody: "yo",
    followupRun: params.followupRun,
    queueKey: "agent:main:telegram",
    resolvedQueue: { mode: "interrupt" } as QueueSettings,
    shouldSteer: false,
    shouldFollowup: false,
    isActive: false,
    isStreaming: false,
    opts: params.opts,
    typing: createMockTypingController(),
    sessionEntry: params.sessionEntry,
    sessionCtx: {
      Provider: "telegram",
      To: "822430204",
      MessageSid: "msg-1",
      AccountId: "default",
      ChatType: "direct",
    } as unknown as TemplateContext,
    defaultModel: "openai-codex/gpt-5.4",
    resolvedVerboseLevel: "off",
    isNewSession: true,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    shouldInjectGroupIntro: false,
    typingMode: "instant",
  });
}

describe("runReplyAgent direct runtime config", () => {
  beforeEach(() => {
    hoisted.getRuntimeConfigSnapshotMock.mockReset();
    hoisted.runPreflightCompactionIfNeededMock.mockReset();
    hoisted.runMemoryFlushIfNeededMock.mockReset();
    hoisted.runAgentTurnWithFallbackMock.mockReset();
    hoisted.runPreflightCompactionIfNeededMock.mockImplementation(async ({ sessionEntry }) => {
      return sessionEntry;
    });
    hoisted.runMemoryFlushIfNeededMock.mockImplementation(async ({ sessionEntry }) => {
      return sessionEntry;
    });
    hoisted.runAgentTurnWithFallbackMock.mockResolvedValue({
      kind: "final",
      payload: { text: "ok" },
    });
  });

  it("replaces stale direct-run config with the active runtime snapshot before preflight and execution", async () => {
    const rawConfig = {
      stale: true,
      skills: {
        entries: {
          goplaces: {
            apiKey: {
              env: "GOOGLE_PLACES_API_KEY",
            },
          },
        },
      },
    };
    const runtimeConfig = {
      runtime: true,
      skills: {
        entries: {
          goplaces: {
            apiKey: "resolved-key",
          },
        },
      },
    };
    hoisted.getRuntimeConfigSnapshotMock.mockReturnValue(runtimeConfig);
    const followupRun = makeFollowupRun(rawConfig);

    const result = await runDirectReply({ followupRun });

    expect(result).toEqual({ text: "ok" });
    expect(followupRun.run.config).toBe(runtimeConfig);
    expect(hoisted.runPreflightCompactionIfNeededMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg: runtimeConfig,
        followupRun: expect.objectContaining({
          run: expect.objectContaining({ config: runtimeConfig }),
        }),
      }),
    );
    expect(hoisted.runMemoryFlushIfNeededMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg: runtimeConfig,
        followupRun: expect.objectContaining({
          run: expect.objectContaining({ config: runtimeConfig }),
        }),
      }),
    );
    expect(hoisted.runAgentTurnWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        followupRun: expect.objectContaining({
          run: expect.objectContaining({ config: runtimeConfig }),
        }),
      }),
    );
  });
});
