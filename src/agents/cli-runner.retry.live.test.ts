import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { runCliAgent } from "./cli-runner.js";
import { isLiveTestEnabled } from "./live-test-helpers.js";

const RETRY_PROBE_LIVE = isLiveTestEnabled() && process.env.OPENCLAW_LIVE_CLI_BACKEND_RESUME_PROBE;
const describeLive = RETRY_PROBE_LIVE ? describe : describe.skip;
const CLI_SESSION_RETRY_PROBE_FIXTURE = path.resolve(
  process.cwd(),
  "test/fixtures/cli-session-expired-retry-probe.mjs",
);

describeLive("cli runner live retry probe", () => {
  it("recovers from session_expired by retrying a fresh cli session", async () => {
    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cli-runner-live-"));
    const stateDir = path.join(tempDir, "state");
    const workspaceDir = path.join(tempDir, "workspace");
    const probeStateFile = path.join(tempDir, "probe-state.json");
    const sessionId = "retry-probe-session";
    const sessionKey = `agent:dev:live-cli-runner:${randomUUID()}`;
    const sessionFile = path.join(stateDir, "agents", "dev", "sessions", `${sessionId}.jsonl`);

    process.env.OPENCLAW_STATE_DIR = stateDir;
    await fs.mkdir(workspaceDir, { recursive: true });

    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          cliBackends: {
            "claude-cli": {
              command: process.execPath,
              args: [CLI_SESSION_RETRY_PROBE_FIXTURE, "fresh", "--state-file", probeStateFile],
              resumeArgs: [
                CLI_SESSION_RETRY_PROBE_FIXTURE,
                "resume",
                "--state-file",
                probeStateFile,
                "--resume-session",
                "{sessionId}",
              ],
              sessionArg: "--session",
              input: "arg",
              output: "jsonl",
              systemPromptWhen: "never",
              sessionIdFields: ["session_id"],
            },
          },
          sandbox: { mode: "off" },
        },
      },
    };

    try {
      const initialNonce = randomBytes(3).toString("hex").toUpperCase();
      const initialResult = await runCliAgent({
        sessionId,
        sessionKey,
        agentId: "dev",
        trigger: "user",
        sessionFile,
        workspaceDir,
        config: cfg,
        prompt: `Reply with exactly: CLI retry INITIAL ${initialNonce}.`,
        provider: "claude-cli",
        model: "retry-probe",
        timeoutMs: 20_000,
        runId: `run-${randomUUID()}`,
      });
      expect(initialResult.payloads?.[0]?.text).toBe(`CLI retry INITIAL ${initialNonce}.`);

      const initialCliSessionId = initialResult.meta?.agentMeta?.cliSessionBinding?.sessionId;
      expect(initialCliSessionId).toBe("retry-probe-session-initial");

      const retryNonce = randomBytes(3).toString("hex").toUpperCase();
      const retryResult = await runCliAgent({
        sessionId,
        sessionKey,
        agentId: "dev",
        trigger: "user",
        sessionFile,
        workspaceDir,
        config: cfg,
        prompt: `Reply with exactly: CLI retry RECOVERED ${retryNonce}.`,
        provider: "claude-cli",
        model: "retry-probe",
        timeoutMs: 20_000,
        runId: `run-${randomUUID()}`,
        cliSessionId: initialCliSessionId,
        cliSessionBinding: initialResult.meta?.agentMeta?.cliSessionBinding,
      });
      expect(retryResult.payloads?.[0]?.text).toBe(`CLI retry RECOVERED ${retryNonce}.`);
      expect(retryResult.meta?.agentMeta?.cliSessionBinding?.sessionId).toBe(
        "retry-probe-session-2",
      );

      const probeState = JSON.parse(await fs.readFile(probeStateFile, "utf-8")) as {
        freshCalls: number;
        resumeCalls: number;
        prompts: string[];
        freshSessionIds: string[];
        resumeSessionIds: string[];
      };
      expect(probeState.freshCalls).toBe(2);
      expect(probeState.resumeCalls).toBe(1);
      expect(probeState.freshSessionIds).toHaveLength(2);
      expect(probeState.freshSessionIds[0]).not.toBe(probeState.freshSessionIds[1]);
      expect(probeState.resumeSessionIds).toEqual(["retry-probe-session-initial"]);
      expect(probeState.prompts).toContain(
        `Reply with exactly: CLI retry INITIAL ${initialNonce}.`,
      );
      expect(probeState.prompts).toContain(
        `Reply with exactly: CLI retry RECOVERED ${retryNonce}.`,
      );
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousStateDir;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 60_000);
});
