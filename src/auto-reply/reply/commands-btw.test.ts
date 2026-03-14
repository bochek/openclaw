import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnSubagentResult } from "../../agents/subagent-spawn.js";
import type { OpenClawConfig } from "../../config/config.js";

const hoisted = vi.hoisted(() => ({
  spawnSubagentDirectMock: vi.fn(),
}));

vi.mock("../../agents/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => hoisted.spawnSubagentDirectMock(...args),
  SUBAGENT_SPAWN_MODES: ["run", "session"],
}));

const { handleBtwCommand } = await import("./commands-btw.js");
const { buildCommandTestParams } = await import("./commands.test-harness.js");

const baseCfg = {
  session: { mainKey: "main", scope: "per-sender" },
} satisfies OpenClawConfig;

function acceptedResult(): SpawnSubagentResult {
  return {
    status: "accepted",
    childSessionKey: "agent:main:subagent:btw-1",
    runId: "run-btw-1",
  };
}

describe("/btw command", () => {
  beforeEach(() => {
    hoisted.spawnSubagentDirectMock.mockReset();
  });

  it("returns null when text commands are disabled", async () => {
    const params = buildCommandTestParams("/btw ping", baseCfg);
    const result = await handleBtwCommand(params, false);
    expect(result).toBeNull();
  });

  it("shows usage when no message is provided", async () => {
    const params = buildCommandTestParams("/btw", baseCfg);
    const result = await handleBtwCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toBe("Usage: /btw <message>");
    expect(hoisted.spawnSubagentDirectMock).not.toHaveBeenCalled();
  });

  it("silently ignores unauthorized senders", async () => {
    const params = buildCommandTestParams("/btw ping", baseCfg, {
      CommandAuthorized: false,
    });
    params.command.isAuthorizedSender = false;
    const result = await handleBtwCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply).toBeUndefined();
    expect(hoisted.spawnSubagentDirectMock).not.toHaveBeenCalled();
  });

  it("spawns a side-question run with the current session", async () => {
    hoisted.spawnSubagentDirectMock.mockResolvedValue(acceptedResult());
    const params = buildCommandTestParams("/btw Can you summarize progress?", baseCfg, {
      OriginatingTo: "channel:main",
      To: "channel:fallback",
    });
    const result = await handleBtwCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("Sent side question with /btw");

    const [spawnParams, spawnCtx] = hoisted.spawnSubagentDirectMock.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(spawnParams).toMatchObject({
      agentId: "main",
      mode: "run",
      cleanup: "delete",
      expectsCompletionMessage: true,
    });
    expect(spawnParams.task).toContain("Side-question mode: answer only this one question.");
    expect(spawnParams.task).toContain("Do not use tools.");
    expect(spawnParams.task).toContain("Question:");
    expect(spawnParams.task).toContain("Can you summarize progress?");
    expect(spawnCtx).toMatchObject({
      agentSessionKey: "agent:main:main",
      agentChannel: "whatsapp",
      agentTo: "channel:main",
    });
  });

  it("includes recent session context in the side-question task", async () => {
    hoisted.spawnSubagentDirectMock.mockResolvedValue(acceptedResult());
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-btw-context-"));
    const sessionFile = path.join(tmpDir, "session.jsonl");
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "continue the migration" }] },
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "I am updating auth.ts" }],
          },
        }),
      ].join("\n"),
      "utf-8",
    );

    const params = buildCommandTestParams("/btw what file are you changing?", baseCfg);
    params.sessionEntry = {
      sessionId: "session-main",
      updatedAt: Date.now(),
      sessionFile,
    };

    try {
      const result = await handleBtwCommand(params, true);
      expect(result?.shouldContinue).toBe(false);
      const [spawnParams] = hoisted.spawnSubagentDirectMock.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(spawnParams.task).toContain("Current session context (recent messages):");
      expect(spawnParams.task).toContain("user: continue the migration");
      expect(spawnParams.task).toContain("assistant: I am updating auth.ts");
      expect(spawnParams.task).toContain("Question:");
      expect(spawnParams.task).toContain("what file are you changing?");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("prefers CommandTargetSessionKey for native commands", async () => {
    hoisted.spawnSubagentDirectMock.mockResolvedValue(acceptedResult());
    const params = buildCommandTestParams("/btw quick check", baseCfg, {
      CommandSource: "native",
      CommandTargetSessionKey: "agent:codex:main",
      OriginatingChannel: "discord",
      OriginatingTo: "channel:12345",
    });
    params.sessionKey = "agent:main:slack:slash:u1";

    const result = await handleBtwCommand(params, true);
    expect(result?.shouldContinue).toBe(false);

    const [spawnParams, spawnCtx] = hoisted.spawnSubagentDirectMock.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(spawnParams.agentId).toBe("codex");
    expect(spawnCtx).toMatchObject({
      agentSessionKey: "agent:codex:main",
      agentChannel: "discord",
      agentTo: "channel:12345",
    });
  });

  it("fails with a clear message when spawn is rejected", async () => {
    hoisted.spawnSubagentDirectMock.mockResolvedValue({
      status: "forbidden",
      error: "sessions_spawn has reached max active children",
    } satisfies SpawnSubagentResult);
    const params = buildCommandTestParams("/btw quick check", baseCfg);
    const result = await handleBtwCommand(params, true);
    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("/btw failed");
    expect(result?.reply?.text).toContain("max active children");
  });
});
