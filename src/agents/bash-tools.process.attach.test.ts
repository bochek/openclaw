import { afterEach, expect, test, vi } from "vitest";
import { addSession, appendOutput, resetProcessRegistryForTests } from "./bash-process-registry.js";
import { createProcessSessionFixture } from "./bash-process-registry.test-helpers.js";
import { createProcessTool } from "./bash-tools.process.js";

afterEach(() => {
  resetProcessRegistryForTests();
});

function readText(result: Awaited<ReturnType<ReturnType<typeof createProcessTool>["execute"]>>) {
  return result.content.find((part) => part.type === "text")?.text ?? "";
}

test("process attach surfaces input-wait hints for idle interactive sessions", async () => {
  vi.useFakeTimers();
  try {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(now);

    const processTool = createProcessTool({ inputWaitIdleMs: 2_000 });
    const session = createProcessSessionFixture({
      id: "sess-attach",
      command: "expo login",
      backgrounded: true,
      startedAt: now - 10_000,
    });
    session.stdin = { write: () => {}, end: () => {}, destroyed: false };
    addSession(session);
    appendOutput(session, "stdout", "Enter 2FA code:\n");

    const result = await processTool.execute("toolcall", {
      action: "attach",
      sessionId: session.id,
    });
    const details = result.details as {
      status?: string;
      waitingForInput?: boolean;
      stdinWritable?: boolean;
      idleMs?: number;
    };
    const text = readText(result);

    expect(details.status).toBe("running");
    expect(details.waitingForInput).toBe(true);
    expect(details.stdinWritable).toBe(true);
    expect(details.idleMs).toBeGreaterThanOrEqual(2_000);
    expect(text).toContain("Enter 2FA code:");
    expect(text).toContain("may be waiting for input");
    expect(text).toContain("process write");
  } finally {
    vi.useRealTimers();
  }
});

test("process poll returns waiting-for-input metadata when no new output arrives", async () => {
  vi.useFakeTimers();
  try {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(now);

    const processTool = createProcessTool({ inputWaitIdleMs: 2_000 });
    const session = createProcessSessionFixture({
      id: "sess-poll-wait",
      command: "expo login",
      backgrounded: true,
      startedAt: now - 10_000,
    });
    session.stdin = { write: () => {}, end: () => {}, destroyed: false };
    addSession(session);

    const poll = await processTool.execute("toolcall", {
      action: "poll",
      sessionId: session.id,
    });
    const details = poll.details as {
      status?: string;
      waitingForInput?: boolean;
      stdinWritable?: boolean;
      idleMs?: number;
    };
    const text = readText(poll);

    expect(details.status).toBe("running");
    expect(details.waitingForInput).toBe(true);
    expect(details.stdinWritable).toBe(true);
    expect(details.idleMs).toBeGreaterThanOrEqual(2_000);
    expect(text).toContain("(no new output)");
    expect(text).toContain("may be waiting for input");
  } finally {
    vi.useRealTimers();
  }
});

test("process list marks idle interactive sessions as input-wait", async () => {
  vi.useFakeTimers();
  try {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(now);

    const processTool = createProcessTool({ inputWaitIdleMs: 2_000 });
    const session = createProcessSessionFixture({
      id: "sess-list-wait",
      command: "expo login",
      backgrounded: true,
      startedAt: now - 10_000,
    });
    session.stdin = { write: () => {}, end: () => {}, destroyed: false };
    addSession(session);

    const list = await processTool.execute("toolcall", { action: "list" });
    const details = list.details as {
      sessions?: Array<{
        sessionId: string;
        waitingForInput?: boolean;
        stdinWritable?: boolean;
      }>;
    };
    const text = readText(list);
    const listed = details.sessions?.find((item) => item.sessionId === session.id);

    expect(listed?.waitingForInput).toBe(true);
    expect(listed?.stdinWritable).toBe(true);
    expect(text).toContain("[input-wait]");
  } finally {
    vi.useRealTimers();
  }
});
