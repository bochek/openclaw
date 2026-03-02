import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSubagentAnnounceFlow } from "../agents/subagent-announce.js";
import { countActiveDescendantRuns } from "../agents/subagent-registry.js";
import type { CliDeps } from "../cli/outbound-send-deps.js";
import type { OpenClawConfig } from "../config/config.js";
import { deliverOutboundPayloads } from "../infra/outbound/deliver.js";
import { resolveOutboundSessionRoute } from "../infra/outbound/outbound-session.js";
import { dispatchCronDelivery } from "./isolated-agent/delivery-dispatch.js";
import {
  expectsSubagentFollowup,
  isLikelyInterimCronMessage,
  readDescendantSubagentFallbackReply,
  waitForDescendantSubagentSummary,
} from "./isolated-agent/subagent-followup.js";
import type { CronJob } from "./types.js";

vi.mock("../agents/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: vi.fn(),
}));

vi.mock("../agents/subagent-registry.js", () => ({
  countActiveDescendantRuns: vi.fn(),
}));

vi.mock("../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: vi.fn(),
}));

vi.mock("../infra/outbound/outbound-session.js", () => ({
  resolveOutboundSessionRoute: vi.fn(),
}));

vi.mock("./isolated-agent/subagent-followup.js", () => ({
  expectsSubagentFollowup: vi.fn(() => false),
  isLikelyInterimCronMessage: vi.fn(() => false),
  readDescendantSubagentFallbackReply: vi.fn(),
  waitForDescendantSubagentSummary: vi.fn(),
}));

function makeJob(): CronJob {
  const now = Date.now();
  return {
    id: "job-1",
    name: "Morning briefing",
    enabled: true,
    createdAtMs: now,
    updatedAtMs: now,
    schedule: { kind: "every", everyMs: 60_000 },
    sessionTarget: "isolated",
    wakeMode: "next-heartbeat",
    payload: { kind: "agentTurn", message: "run" },
    delivery: { mode: "announce", channel: "telegram", to: "123" },
    state: {},
  };
}

function makeParams(overrides: Partial<Parameters<typeof dispatchCronDelivery>[0]> = {}) {
  const cfg = {
    session: { mainKey: "main" },
  } as OpenClawConfig;

  const withRunSession = (
    result: Parameters<Parameters<typeof dispatchCronDelivery>[0]["withRunSession"]>[0],
  ) => ({
    ...result,
    sessionId: "run-session",
    sessionKey: "agent:main:cron:job-1:run:run-session",
  });

  return {
    cfg,
    cfgWithAgentDefaults: cfg,
    deps: {
      sendMessageSlack: vi.fn(),
      sendMessageWhatsApp: vi.fn(),
      sendMessageTelegram: vi.fn(),
      sendMessageDiscord: vi.fn(),
      sendMessageSignal: vi.fn(),
      sendMessageIMessage: vi.fn(),
    } as CliDeps,
    job: makeJob(),
    agentId: "main",
    agentSessionKey: "agent:main:cron:job-1",
    runSessionId: "run-session",
    runStartedAt: 1,
    runEndedAt: 2,
    timeoutMs: 1_000,
    resolvedDelivery: {
      ok: true,
      channel: "telegram",
      to: "123",
      mode: "explicit",
    } as const,
    deliveryRequested: true,
    skipHeartbeatDelivery: false,
    skipMessagingToolDelivery: false,
    deliveryBestEffort: false,
    deliveryPayloadHasStructuredContent: false,
    deliveryPayloads: [{ text: "final summary" }],
    synthesizedText: "final summary",
    summary: "final",
    outputText: "final summary",
    telemetry: undefined,
    abortSignal: undefined,
    isAborted: () => false,
    abortReason: () => "aborted",
    withRunSession,
    ...overrides,
  };
}

describe("dispatchCronDelivery announce path", () => {
  beforeEach(() => {
    vi.mocked(runSubagentAnnounceFlow).mockReset().mockResolvedValue(true);
    vi.mocked(countActiveDescendantRuns).mockReset().mockReturnValue(0);
    vi.mocked(deliverOutboundPayloads)
      .mockReset()
      .mockResolvedValue([{ channel: "telegram", messageId: "m1" }] as never);
    vi.mocked(resolveOutboundSessionRoute)
      .mockReset()
      .mockResolvedValue({
        sessionKey: "agent:main:telegram:direct:123",
      } as never);
    vi.mocked(expectsSubagentFollowup).mockReset().mockReturnValue(false);
    vi.mocked(isLikelyInterimCronMessage).mockReset().mockReturnValue(false);
    vi.mocked(waitForDescendantSubagentSummary).mockReset().mockResolvedValue(undefined);
    vi.mocked(readDescendantSubagentFallbackReply).mockReset().mockResolvedValue(undefined);
  });

  it("delivers a simple cron completion through announce flow", async () => {
    const res = await dispatchCronDelivery(makeParams());

    expect(res.result).toBeUndefined();
    expect(res.delivered).toBe(true);
    expect(vi.mocked(runSubagentAnnounceFlow)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deliverOutboundPayloads)).not.toHaveBeenCalled();
  });

  it("falls back to direct outbound delivery when subagent cron announce returns false", async () => {
    vi.mocked(countActiveDescendantRuns).mockReset().mockReturnValueOnce(2).mockReturnValue(0);
    vi.mocked(waitForDescendantSubagentSummary).mockResolvedValueOnce(
      "final summary from spawned subagents",
    );
    vi.mocked(runSubagentAnnounceFlow).mockResolvedValueOnce(false);

    const res = await dispatchCronDelivery(
      makeParams({
        synthesizedText: "on it, spawned a subagent and waiting for results",
        outputText: "on it, spawned a subagent and waiting for results",
        deliveryPayloads: [{ text: "on it, spawned a subagent and waiting for results" }],
      }),
    );

    expect(res.result).toBeUndefined();
    expect(res.delivered).toBe(true);
    expect(vi.mocked(runSubagentAnnounceFlow)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runSubagentAnnounceFlow).mock.calls[0]?.[0]?.roundOneReply).toBe(
      "final summary from spawned subagents",
    );
    expect(vi.mocked(deliverOutboundPayloads)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deliverOutboundPayloads).mock.calls[0]?.[0]?.payloads).toEqual([
      { text: "final summary from spawned subagents" },
    ]);
  });

  it("falls back to direct outbound delivery for orchestrator cron summaries from descendant fallback", async () => {
    vi.mocked(expectsSubagentFollowup).mockReturnValueOnce(true);
    vi.mocked(waitForDescendantSubagentSummary).mockResolvedValueOnce(undefined);
    vi.mocked(readDescendantSubagentFallbackReply).mockResolvedValueOnce(
      "worker one done\n\nworker two done",
    );
    vi.mocked(runSubagentAnnounceFlow).mockResolvedValueOnce(false);

    const res = await dispatchCronDelivery(
      makeParams({
        synthesizedText: "subagent spawned, it'll auto-announce when done",
        outputText: "subagent spawned, it'll auto-announce when done",
        deliveryPayloads: [{ text: "subagent spawned, it'll auto-announce when done" }],
      }),
    );

    expect(res.result).toBeUndefined();
    expect(res.delivered).toBe(true);
    expect(vi.mocked(runSubagentAnnounceFlow).mock.calls[0]?.[0]?.roundOneReply).toBe(
      "worker one done\n\nworker two done",
    );
    expect(vi.mocked(deliverOutboundPayloads)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deliverOutboundPayloads).mock.calls[0]?.[0]?.payloads).toEqual([
      { text: "worker one done\n\nworker two done" },
    ]);
  });
});
