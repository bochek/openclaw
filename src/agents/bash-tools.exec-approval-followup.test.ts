import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayToolMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock("./tools/gateway.js", () => ({
  callGatewayTool: callGatewayToolMock,
}));

let buildExecApprovalFollowupPrompt: typeof import("./bash-tools.exec-approval-followup.js").buildExecApprovalFollowupPrompt;
let sendExecApprovalFollowup: typeof import("./bash-tools.exec-approval-followup.js").sendExecApprovalFollowup;

beforeAll(async () => {
  ({ buildExecApprovalFollowupPrompt, sendExecApprovalFollowup } = await import(
    "./bash-tools.exec-approval-followup.js"
  ));
});

beforeEach(() => {
  callGatewayToolMock.mockReset();
  callGatewayToolMock.mockResolvedValue({ ok: true });
});

describe("exec approval followup", () => {
  it("uses an explicit denial prompt when the command did not run", () => {
    const prompt = buildExecApprovalFollowupPrompt(
      "Exec denied (gateway id=req-1, user-denied): uname -a",
    );

    expect(prompt).toContain("did not run");
    expect(prompt).toContain("Do not mention, summarize, or reuse output");
    expect(prompt).not.toContain("already approved has completed");
  });

  it("keeps followups internal when no external route is available", async () => {
    const ok = await sendExecApprovalFollowup({
      approvalId: "req-1",
      sessionKey: "agent:main:main",
      resultText: "Exec completed: echo ok",
    });

    expect(ok).toBe(true);
    expect(callGatewayToolMock).toHaveBeenCalledTimes(1);
    expect(callGatewayToolMock).toHaveBeenCalledWith(
      "agent",
      expect.any(Object),
      expect.objectContaining({
        sessionKey: "agent:main:main",
        deliver: false,
        channel: undefined,
        to: undefined,
      }),
      { expectFinal: true },
    );
  });

  it("keeps followup session-only when turn source is internal webchat", async () => {
    const ok = await sendExecApprovalFollowup({
      approvalId: "approval-2",
      sessionKey: "agent:main:main",
      turnSourceChannel: "webchat",
      turnSourceTo: "chat:123",
      resultText: "Exec finished (gateway id=approval-2, code 0)",
    });

    expect(ok).toBe(true);
    const payload = callGatewayToolMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload.deliver).toBe(false);
    expect(payload).not.toHaveProperty("bestEffortDeliver");
    expect(payload.channel).toBe("webchat");
    expect(payload.to).toBe("chat:123");
  });

  it("enables delivery for valid external turn source targets", async () => {
    const ok = await sendExecApprovalFollowup({
      approvalId: "approval-3",
      sessionKey: "agent:main:main",
      turnSourceChannel: " discord ",
      turnSourceTo: "channel:123",
      turnSourceAccountId: "default",
      turnSourceThreadId: "456",
      resultText: "Exec completed: echo ok",
    });

    expect(ok).toBe(true);
    expect(callGatewayToolMock).toHaveBeenCalledWith(
      "agent",
      expect.any(Object),
      expect.objectContaining({
        sessionKey: "agent:main:main",
        deliver: true,
        bestEffortDeliver: true,
        channel: "discord",
        to: "channel:123",
        accountId: "default",
        threadId: "456",
      }),
      { expectFinal: true },
    );
  });
});
