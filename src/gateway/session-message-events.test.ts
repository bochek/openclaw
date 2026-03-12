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
  rpcReq,
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
  test("only sends transcript events to subscribed operator clients", async () => {
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
      const subscribedWs = await harness.openWs();
      const unsubscribedWs = await harness.openWs();
      const nodeWs = await harness.openWs();
      try {
        await connectOk(subscribedWs, { scopes: ["operator.read"] });
        await rpcReq(subscribedWs, "sessions.subscribe");
        await connectOk(unsubscribedWs, { scopes: ["operator.read"] });
        await connectOk(nodeWs, { role: "node", scopes: [] });

        const subscribedEvent = onceMessage(
          subscribedWs,
          (message) =>
            message.type === "event" &&
            message.event === "session.message" &&
            (message.payload as { sessionKey?: string } | undefined)?.sessionKey ===
              "agent:main:main",
        );
        const unsubscribedEvent = Promise.race([
          onceMessage(
            unsubscribedWs,
            (message) => message.type === "event" && message.event === "session.message",
          ).then(() => "received"),
          new Promise((resolve) => setTimeout(() => resolve("timeout"), 300)),
        ]);
        const nodeEvent = Promise.race([
          onceMessage(
            nodeWs,
            (message) => message.type === "event" && message.event === "session.message",
          ).then(() => "received"),
          new Promise((resolve) => setTimeout(() => resolve("timeout"), 300)),
        ]);

        const appended = await appendAssistantMessageToSessionTranscript({
          sessionKey: "agent:main:main",
          text: "subscribed only",
          storePath,
        });
        expect(appended.ok).toBe(true);
        await expect(subscribedEvent).resolves.toBeTruthy();
        await expect(unsubscribedEvent).resolves.toBe("timeout");
        await expect(nodeEvent).resolves.toBe("timeout");
      } finally {
        subscribedWs.close();
        unsubscribedWs.close();
        nodeWs.close();
      }
    } finally {
      await harness.close();
    }
  });

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
        await connectOk(ws, { scopes: ["operator.read"] });
        await rpcReq(ws, "sessions.subscribe");

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
        expect((event.payload as { messageSeq?: number }).messageSeq).toBe(1);
        expect(
          (
            event.payload as {
              message?: { __openclaw?: { id?: string; seq?: number } };
            }
          ).message?.__openclaw,
        ).toMatchObject({
          id: appended.messageId,
          seq: 1,
        });
      } finally {
        ws.close();
      }
    } finally {
      await harness.close();
    }
  });

  test("sessions.messages.subscribe only delivers transcript events for the requested session", async () => {
    const storePath = await createSessionStoreFile();
    await writeSessionStore({
      entries: {
        main: {
          sessionId: "sess-main",
          updatedAt: Date.now(),
        },
        worker: {
          sessionId: "sess-worker",
          updatedAt: Date.now(),
        },
      },
      storePath,
    });

    const harness = await createGatewaySuiteHarness();
    try {
      const ws = await harness.openWs();
      try {
        await connectOk(ws, { scopes: ["operator.read"] });
        const subscribeRes = await rpcReq(ws, "sessions.messages.subscribe", {
          key: "agent:main:main",
        });
        expect(subscribeRes.ok).toBe(true);
        expect(subscribeRes.payload?.subscribed).toBe(true);
        expect(subscribeRes.payload?.key).toBe("agent:main:main");

        const mainEvent = onceMessage(
          ws,
          (message) =>
            message.type === "event" &&
            message.event === "session.message" &&
            (message.payload as { sessionKey?: string } | undefined)?.sessionKey ===
              "agent:main:main",
        );
        const workerEvent = Promise.race([
          onceMessage(
            ws,
            (message) =>
              message.type === "event" &&
              message.event === "session.message" &&
              (message.payload as { sessionKey?: string } | undefined)?.sessionKey ===
                "agent:main:worker",
          ).then(() => "received"),
          new Promise((resolve) => setTimeout(() => resolve("timeout"), 300)),
        ]);

        const [mainAppend] = await Promise.all([
          appendAssistantMessageToSessionTranscript({
            sessionKey: "agent:main:main",
            text: "main only",
            storePath,
          }),
          mainEvent,
        ]);
        expect(mainAppend.ok).toBe(true);

        const workerAppend = await appendAssistantMessageToSessionTranscript({
          sessionKey: "agent:main:worker",
          text: "worker hidden",
          storePath,
        });
        expect(workerAppend.ok).toBe(true);
        await expect(workerEvent).resolves.toBe("timeout");

        const unsubscribeRes = await rpcReq(ws, "sessions.messages.unsubscribe", {
          key: "agent:main:main",
        });
        expect(unsubscribeRes.ok).toBe(true);
        expect(unsubscribeRes.payload?.subscribed).toBe(false);

        const postUnsubscribeEvent = Promise.race([
          onceMessage(
            ws,
            (message) =>
              message.type === "event" &&
              message.event === "session.message" &&
              (message.payload as { sessionKey?: string } | undefined)?.sessionKey ===
                "agent:main:main",
          ).then(() => "received"),
          new Promise((resolve) => setTimeout(() => resolve("timeout"), 300)),
        ]);
        const hiddenAppend = await appendAssistantMessageToSessionTranscript({
          sessionKey: "agent:main:main",
          text: "hidden after unsubscribe",
          storePath,
        });
        expect(hiddenAppend.ok).toBe(true);
        await expect(postUnsubscribeEvent).resolves.toBe("timeout");
      } finally {
        ws.close();
      }
    } finally {
      await harness.close();
    }
  });
});
