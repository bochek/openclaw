import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS,
  DEFAULT_APPROVAL_TIMEOUT_MS,
} from "./bash-tools.exec-runtime.js";
import { __testing as gatewayToolTesting } from "./tools/gateway.js";

const callGatewayToolMock = vi.hoisted(() => vi.fn());

import { requestExecApprovalDecision } from "./bash-tools.exec-approval-request.js";

describe("requestExecApprovalDecision", () => {
  beforeEach(() => {
    callGatewayToolMock.mockReset();
    gatewayToolTesting.setDepsForTest({
      callGateway: async ({ method, params, timeoutMs, expectFinal }) =>
        await callGatewayToolMock(method, { timeoutMs }, params, { expectFinal }),
    });
  });

  afterEach(() => {
    gatewayToolTesting.setDepsForTest();
  });

  it("returns string decisions", async () => {
    callGatewayToolMock
      .mockResolvedValueOnce({
        status: "accepted",
        id: "approval-id",
        expiresAtMs: DEFAULT_APPROVAL_TIMEOUT_MS,
      })
      .mockResolvedValueOnce({ decision: "allow-once" });

    const result = await requestExecApprovalDecision({
      id: "approval-id",
      command: "echo hi",
      cwd: "/tmp",
      host: "gateway",
      security: "allowlist",
      ask: "always",
      agentId: "main",
      resolvedPath: "/usr/bin/echo",
      sessionKey: "session",
      turnSourceChannel: "whatsapp",
      turnSourceTo: "+15555550123",
      turnSourceAccountId: "work",
      turnSourceThreadId: "1739201675.123",
    });

    expect(result).toBe("allow-once");
    expect(callGatewayToolMock).toHaveBeenCalledWith(
      "exec.approval.request",
      { timeoutMs: DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS },
      {
        id: "approval-id",
        command: "echo hi",
        cwd: "/tmp",
        nodeId: undefined,
        host: "gateway",
        security: "allowlist",
        ask: "always",
        agentId: "main",
        resolvedPath: "/usr/bin/echo",
        sessionKey: "session",
        turnSourceChannel: "whatsapp",
        turnSourceTo: "+15555550123",
        turnSourceAccountId: "work",
        turnSourceThreadId: "1739201675.123",
        timeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
        twoPhase: true,
      },
      { expectFinal: false },
    );
    expect(callGatewayToolMock).toHaveBeenNthCalledWith(
      2,
      "exec.approval.waitDecision",
      { timeoutMs: DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS },
      { id: "approval-id" },
      { expectFinal: undefined },
    );
  });

  it("returns null for missing or non-string decisions", async () => {
    callGatewayToolMock
      .mockResolvedValueOnce({ status: "accepted", id: "approval-id", expiresAtMs: 1234 })
      .mockResolvedValueOnce({});
    await expect(
      requestExecApprovalDecision({
        id: "approval-id",
        command: "echo hi",
        cwd: "/tmp",
        nodeId: "node-1",
        host: "node",
        security: "allowlist",
        ask: "on-miss",
      }),
    ).resolves.toBeNull();

    callGatewayToolMock
      .mockResolvedValueOnce({ status: "accepted", id: "approval-id-2", expiresAtMs: 1234 })
      .mockResolvedValueOnce({ decision: 123 });
    await expect(
      requestExecApprovalDecision({
        id: "approval-id-2",
        command: "echo hi",
        cwd: "/tmp",
        nodeId: "node-1",
        host: "node",
        security: "allowlist",
        ask: "on-miss",
      }),
    ).resolves.toBeNull();
  });

  it("uses registration response id when waiting for decision", async () => {
    callGatewayToolMock
      .mockResolvedValueOnce({
        status: "accepted",
        id: "server-assigned-id",
        expiresAtMs: DEFAULT_APPROVAL_TIMEOUT_MS,
      })
      .mockResolvedValueOnce({ decision: "allow-once" });

    await expect(
      requestExecApprovalDecision({
        id: "client-id",
        command: "echo hi",
        cwd: "/tmp",
        host: "gateway",
        security: "allowlist",
        ask: "on-miss",
      }),
    ).resolves.toBe("allow-once");

    expect(callGatewayToolMock).toHaveBeenNthCalledWith(
      2,
      "exec.approval.waitDecision",
      { timeoutMs: DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS },
      { id: "server-assigned-id" },
      { expectFinal: undefined },
    );
  });

  it("treats expired-or-missing waitDecision as null decision", async () => {
    callGatewayToolMock
      .mockResolvedValueOnce({
        status: "accepted",
        id: "approval-id",
        expiresAtMs: DEFAULT_APPROVAL_TIMEOUT_MS,
      })
      .mockRejectedValueOnce(new Error("approval expired or not found"));

    await expect(
      requestExecApprovalDecision({
        id: "approval-id",
        command: "echo hi",
        cwd: "/tmp",
        host: "gateway",
        security: "allowlist",
        ask: "on-miss",
      }),
    ).resolves.toBeNull();
  });

  it("returns final decision directly when gateway already replies with decision", async () => {
    callGatewayToolMock.mockResolvedValue({ decision: "deny", id: "approval-id" });

    const result = await requestExecApprovalDecision({
      id: "approval-id",
      command: "echo hi",
      cwd: "/tmp",
      host: "gateway",
      security: "allowlist",
      ask: "on-miss",
    });

    expect(result).toBe("deny");
    expect(callGatewayToolMock.mock.calls).toHaveLength(1);
  });
});
