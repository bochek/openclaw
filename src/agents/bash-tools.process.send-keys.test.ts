import { afterEach, expect, test } from "vitest";
import { addSession, resetProcessRegistryForTests } from "./bash-process-registry.js";
import { createProcessSessionFixture } from "./bash-process-registry.test-helpers.js";
import { createProcessTool } from "./bash-tools.process.js";

function createWritableStdinStub() {
  return {
    write(_data: string, cb?: (err?: Error | null) => void) {
      cb?.();
    },
    end() {},
    destroyed: false,
  };
}

afterEach(() => {
  resetProcessRegistryForTests();
});

function createCapturingStdinStub() {
  let written = "";
  return {
    stdin: {
      write(data: string, cb?: (err?: Error | null) => void) {
        written += data;
        cb?.();
      },
      end() {},
      destroyed: false,
    },
    getWritten: () => written,
  };
}

test("process send-keys encodes Enter for pty sessions", async () => {
  const capture = createCapturingStdinStub();
  const session = createProcessSessionFixture({
    id: "sess-send-keys",
    command: "vim",
    backgrounded: true,
    cursorKeyMode: "normal",
  });
  session.stdin = capture.stdin;
  addSession(session);

  const processTool = createProcessTool();
  const result = await processTool.execute("toolcall", {
    action: "send-keys",
    sessionId: session.id,
    keys: ["h", "i", "Enter"],
  });

  expect(result.details).toMatchObject({ status: "running" });
  expect(capture.getWritten()).toBe("hi\r");
});

test("process submit sends Enter for pty sessions", async () => {
  const capture = createCapturingStdinStub();
  const session = createProcessSessionFixture({
    id: "sess-submit",
    command: "vim",
    backgrounded: true,
    cursorKeyMode: "normal",
  });
  session.stdin = capture.stdin;
  addSession(session);

  const processTool = createProcessTool();
  const result = await processTool.execute("toolcall", {
    action: "submit",
    sessionId: session.id,
  });

  expect(result.details).toMatchObject({ status: "running" });
  expect(capture.getWritten()).toBe("\r");
});

test("process send-keys fails loud for unknown cursor mode when arrows depend on it", async () => {
  const session = createProcessSessionFixture({
    id: "sess-unknown-mode",
    command: "vim",
    backgrounded: true,
    cursorKeyMode: "unknown",
  });
  session.stdin = createWritableStdinStub();
  addSession(session);

  const processTool = createProcessTool();
  const result = await processTool.execute("toolcall", {
    action: "send-keys",
    sessionId: "sess-unknown-mode",
    keys: ["up"],
  });

  expect(result.details).toMatchObject({ status: "failed" });
  expect(result.content[0]).toMatchObject({
    type: "text",
    text: expect.stringContaining("cursor key mode is not known yet"),
  });
});

test("process send-keys still sends non-cursor keys while mode is unknown", async () => {
  const session = createProcessSessionFixture({
    id: "sess-unknown-enter",
    command: "vim",
    backgrounded: true,
    cursorKeyMode: "unknown",
  });
  session.stdin = createWritableStdinStub();
  addSession(session);

  const processTool = createProcessTool();
  const result = await processTool.execute("toolcall", {
    action: "send-keys",
    sessionId: "sess-unknown-enter",
    keys: ["Enter"],
  });

  expect(result.details).toMatchObject({ status: "running" });
});
