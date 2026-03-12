import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { appendAssistantMessageToSessionTranscript } from "../config/sessions/transcript.js";
import { testState } from "./test-helpers.mocks.js";
import {
  connectOk,
  createGatewaySuiteHarness,
  installGatewayTestHooks,
  onceMessage,
  writeSessionStore,
} from "./test-helpers.server.js";

installGatewayTestHooks();

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function createSessionStoreFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-session-message-"));
  cleanupDirs.push(dir);
  const storePath = path.join(dir, "sessions.json");
  testState.sessionStorePath = storePath;
  return storePath;
}

describe("session.message websocket events", () => {
  test("broadcasts appended transcript messages with the session key", async () => {
    const storePath = await createSessionStoreFile();
    await writeSessionStore({
      entries: {
        main: {
          sessionId: "sess-main",
          updatedAt: Date.now(),
        },
      },
      storePath,
    });

    const harness = await createGatewaySuiteHarness();
    try {
      const ws = await harness.openWs();
      try {
        await connectOk(ws);

        const appendPromise = appendAssistantMessageToSessionTranscript({
          sessionKey: "agent:main:main",
          text: "live websocket message",
          storePath,
        });
        const eventPromise = onceMessage(
          ws,
          (message) =>
            message.type === "event" &&
            message.event === "session.message" &&
            (message.payload as { sessionKey?: string } | undefined)?.sessionKey ===
              "agent:main:main",
        );

        const [appended, event] = await Promise.all([appendPromise, eventPromise]);
        expect(appended.ok).toBe(true);
        expect(
          (event.payload as { message?: { content?: Array<{ text?: string }> } }).message
            ?.content?.[0]?.text,
        ).toBe("live websocket message");
      } finally {
        ws.close();
      }
    } finally {
      await harness.close();
    }
  });
});
