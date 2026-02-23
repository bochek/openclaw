import { describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";

const loadConfigMock = vi.hoisted(() =>
  vi.fn(() => ({
    agents: {
      defaults: {
        model: { primary: "pi:opus" },
        models: { "pi:opus": {} },
        contextTokens: 32000,
      },
      list: [
        { id: "main", default: false },
        { id: "voice", default: true },
      ],
    },
    session: {
      store: "/tmp/sessions-{agentId}.json",
    },
  })),
);

const resolveStorePathMock = vi.hoisted(() =>
  vi.fn((_store: string | undefined, opts?: { agentId?: string }) => {
    return `/tmp/sessions-${opts?.agentId ?? "missing"}.json`;
  }),
);
const loadSessionStoreMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: loadConfigMock,
  };
});

vi.mock("../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/sessions.js")>();
  return {
    ...actual,
    resolveStorePath: resolveStorePathMock,
    loadSessionStore: loadSessionStoreMock,
  };
});

import { sessionsCommand } from "./sessions.js";

function createRuntime(): { runtime: RuntimeEnv; logs: string[] } {
  const logs: string[] = [];
  return {
    runtime: {
      log: (msg: unknown) => logs.push(String(msg)),
      error: vi.fn(),
      exit: vi.fn(),
    },
    logs,
  };
}

describe("sessionsCommand default store agent selection", () => {
  it("includes agentId on sessions rows for --all-agents JSON output", async () => {
    resolveStorePathMock.mockClear();
    loadSessionStoreMock.mockReset();
    loadSessionStoreMock
      .mockReturnValueOnce({
        main_row: { sessionId: "s1", updatedAt: Date.now() - 60_000, model: "pi:opus" },
      })
      .mockReturnValueOnce({
        voice_row: { sessionId: "s2", updatedAt: Date.now() - 120_000, model: "pi:opus" },
      });
    const { runtime, logs } = createRuntime();

    await sessionsCommand({ allAgents: true, json: true }, runtime);

    const payload = JSON.parse(logs[0] ?? "{}") as {
      allAgents?: boolean;
      sessions?: Array<{ key: string; agentId?: string }>;
    };
    expect(payload.allAgents).toBe(true);
    expect(payload.sessions?.map((session) => session.agentId)).toContain("main");
    expect(payload.sessions?.map((session) => session.agentId)).toContain("voice");
  });

  it("uses configured default agent id when resolving implicit session store path", async () => {
    resolveStorePathMock.mockClear();
    const { runtime, logs } = createRuntime();

    await sessionsCommand({}, runtime);

    expect(resolveStorePathMock).toHaveBeenCalledWith("/tmp/sessions-{agentId}.json", {
      agentId: "voice",
    });
    expect(logs[0]).toContain("Session store: /tmp/sessions-voice.json");
  });

  it("uses all configured agent stores with --all-agents", async () => {
    resolveStorePathMock.mockClear();
    loadSessionStoreMock.mockReset();
    loadSessionStoreMock
      .mockReturnValueOnce({
        main_row: { sessionId: "s1", updatedAt: Date.now() - 60_000, model: "pi:opus" },
      })
      .mockReturnValueOnce({});
    const { runtime, logs } = createRuntime();

    await sessionsCommand({ allAgents: true }, runtime);

    expect(resolveStorePathMock).toHaveBeenCalledWith("/tmp/sessions-{agentId}.json", {
      agentId: "main",
    });
    expect(resolveStorePathMock).toHaveBeenCalledWith("/tmp/sessions-{agentId}.json", {
      agentId: "voice",
    });
    expect(logs[0]).toContain("Session stores: 2 (main, voice)");
    expect(logs[2]).toContain("Agent");
  });
});
