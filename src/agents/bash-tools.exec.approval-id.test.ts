import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearConfigCache, clearRuntimeConfigSnapshot } from "../config/config.js";
import { buildSystemRunPreparePayload } from "../test-utils/system-run-prepare-payload.js";

const hoisted = vi.hoisted(() => ({
  gatewayCallMock: vi.fn(),
  listNodesMock: vi.fn(),
  resolveNodeIdFromListMock: vi.fn(),
  detectCommandObfuscationMock: vi.fn(),
}));

let createExecTool: typeof import("./bash-tools.exec.js").createExecTool;
let gatewayToolTesting: typeof import("./tools/gateway.js").__testing;
let getExecApprovalApproverDmNoticeText: typeof import("../infra/exec-approval-reply.js").getExecApprovalApproverDmNoticeText;
let nodeHostTesting: typeof import("./bash-tools.exec-host-node.js").__testing;

vi.mock("./tools/nodes-utils.js", () => ({
  listNodes: (...args: unknown[]) => hoisted.listNodesMock(...args),
  resolveNodeIdFromList: (...args: unknown[]) => hoisted.resolveNodeIdFromListMock(...args),
}));

vi.mock("../infra/exec-obfuscation-detect.js", () => ({
  detectCommandObfuscation: (...args: unknown[]) => hoisted.detectCommandObfuscationMock(...args),
}));

function buildPreparedSystemRunPayload(rawInvokeParams: unknown) {
  const invoke = (rawInvokeParams ?? {}) as {
    params?: {
      command?: unknown;
      rawCommand?: unknown;
      cwd?: unknown;
      agentId?: unknown;
      sessionKey?: unknown;
    };
  };
  const params = invoke.params ?? {};
  return buildSystemRunPreparePayload(params);
}

function getTestConfigPath() {
  return path.join(process.env.HOME ?? "", ".openclaw", "openclaw.json");
}

async function writeOpenClawConfig(config: Record<string, unknown>, pretty = false) {
  const configPath = getTestConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, pretty ? 2 : undefined));
}

async function writeExecApprovalsConfig(config: Record<string, unknown>) {
  const approvalsPath = path.join(process.env.HOME ?? "", ".openclaw", "exec-approvals.json");
  await fs.mkdir(path.dirname(approvalsPath), { recursive: true });
  await fs.writeFile(approvalsPath, JSON.stringify(config, null, 2));
}

async function pollUntil<T>(
  read: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeout: number; interval?: number },
): Promise<T> {
  const deadline = Date.now() + options.timeout;
  const interval = options.interval ?? 20;
  for (;;) {
    const value = await read();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error("pollUntil timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

function acceptedApprovalResponse(params: unknown) {
  return { status: "accepted", id: (params as { id?: string })?.id };
}

function getResultText(result: { content: Array<{ type?: string; text?: string }> }) {
  return result.content.find((part) => part.type === "text")?.text ?? "";
}

function expectPendingApprovalText(
  result: {
    details: { status?: string };
    content: Array<{ type?: string; text?: string }>;
  },
  options: {
    command: string;
    host: "gateway" | "node";
    nodeId?: string;
    interactive?: boolean;
  },
) {
  expect(result.details.status).toBe("approval-pending");
  const details = result.details as { approvalId: string; approvalSlug: string };
  const pendingText = getResultText(result);
  expect(pendingText).toContain(
    `Reply with: /approve ${details.approvalSlug} allow-once|allow-always|deny`,
  );
  expect(pendingText).toContain(`full ${details.approvalId}`);
  expect(pendingText).toContain(`Host: ${options.host}`);
  if (options.nodeId) {
    expect(pendingText).toContain(`Node: ${options.nodeId}`);
  }
  expect(pendingText).toContain(`CWD: ${process.cwd()}`);
  expect(pendingText).toContain("Command:\n```sh\n");
  expect(pendingText).toContain(options.command);
  if (options.interactive) {
    expect(pendingText).toContain("Mode: foreground (interactive approvals available).");
    expect(pendingText).toContain("Background mode requires pre-approved policy");
  }
  return details;
}

function expectPendingCommandText(
  result: {
    details: { status?: string };
    content: Array<{ type?: string; text?: string }>;
  },
  command: string,
) {
  expect(result.details.status).toBe("approval-pending");
  const text = getResultText(result);
  expect(text).toContain("Command:\n```sh\n");
  expect(text).toContain(command);
}

function mockGatewayOkCalls(calls: string[]) {
  hoisted.gatewayCallMock.mockImplementation(async (method) => {
    calls.push(method);
    return { ok: true };
  });
}

function createElevatedAllowlistExecTool() {
  return createExecTool({
    ask: "on-miss",
    security: "allowlist",
    approvalRunningNoticeMs: 0,
    elevated: { enabled: true, allowed: true, defaultLevel: "ask" },
  });
}

async function expectGatewayExecWithoutApproval(options: {
  config: Record<string, unknown>;
  command: string;
  ask?: "always" | "on-miss" | "off";
}) {
  await writeExecApprovalsConfig(options.config);
  const calls: string[] = [];
  mockGatewayOkCalls(calls);

  const tool = createExecTool({
    host: "gateway",
    ask: options.ask,
    security: "full",
    approvalRunningNoticeMs: 0,
  });

  const result = await tool.execute("call-no-approval", { command: options.command });
  expect(result.details.status).toBe("completed");
  expect(calls).not.toContain("exec.approval.request");
  expect(calls).not.toContain("exec.approval.waitDecision");
}

function mockAcceptedApprovalFlow(options: {
  onAgent?: (params: Record<string, unknown>) => void;
  onNodeInvoke?: (params: unknown) => unknown;
}) {
  hoisted.gatewayCallMock.mockImplementation(async (method, _opts, params) => {
    if (method === "exec.approval.request") {
      return acceptedApprovalResponse(params);
    }
    if (method === "exec.approval.waitDecision") {
      return { decision: "allow-once" };
    }
    if (method === "agent" && options.onAgent) {
      options.onAgent(params as Record<string, unknown>);
      return { status: "ok" };
    }
    if (method === "node.invoke" && options.onNodeInvoke) {
      return await options.onNodeInvoke(params);
    }
    return { ok: true };
  });
}

function mockPendingApprovalRegistration() {
  hoisted.gatewayCallMock.mockImplementation(async (method) => {
    if (method === "exec.approval.request") {
      return { status: "accepted", id: "approval-id" };
    }
    if (method === "exec.approval.waitDecision") {
      return { decision: null };
    }
    return { ok: true };
  });
}

describe("exec approvals", () => {
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;

  beforeEach(async () => {
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-test-"));
    process.env.HOME = tempDir;
    // Windows uses USERPROFILE for os.homedir()
    process.env.USERPROFILE = tempDir;
    vi.resetModules();
    ({ __testing: gatewayToolTesting } = await import("./tools/gateway.js"));
    ({ __testing: nodeHostTesting } = await import("./bash-tools.exec-host-node.js"));
    ({ createExecTool } = await import("./bash-tools.exec.js"));
    ({ getExecApprovalApproverDmNoticeText } = await import("../infra/exec-approval-reply.js"));
    hoisted.gatewayCallMock.mockReset();
    hoisted.listNodesMock.mockReset().mockResolvedValue([
      { nodeId: "node-1", commands: ["system.run"], platform: "darwin" },
    ]);
    hoisted.resolveNodeIdFromListMock
      .mockReset()
      .mockImplementation((nodes: Array<{ nodeId?: string }>) => nodes[0]?.nodeId);
    hoisted.detectCommandObfuscationMock.mockReset().mockReturnValue({
      detected: false,
      reasons: [],
      matchedPatterns: [],
    });
    gatewayToolTesting.setDepsForTest({
      callGateway: async ({ method, params, timeoutMs, expectFinal }) =>
        await hoisted.gatewayCallMock(method, { timeoutMs }, params, { expectFinal }),
    });
    nodeHostTesting.setDepsForTest({
      listNodes: async () =>
        await hoisted.listNodesMock(),
      resolveNodeIdFromList: (...args) => hoisted.resolveNodeIdFromListMock(...args),
      detectCommandObfuscation: (...args) => hoisted.detectCommandObfuscationMock(...args),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    gatewayToolTesting.setDepsForTest();
    nodeHostTesting.setDepsForTest();
    clearRuntimeConfigSnapshot();
    clearConfigCache();
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  });

  it("reuses approval id as the node runId", async () => {
    let invokeParams: unknown;
    let agentParams: unknown;

    mockAcceptedApprovalFlow({
      onAgent: (params) => {
        agentParams = params;
      },
      onNodeInvoke: (params) => {
        const invoke = params as { command?: string };
        if (invoke.command === "system.run.prepare") {
          return buildPreparedSystemRunPayload(params);
        }
        if (invoke.command === "system.run") {
          invokeParams = params;
          return { payload: { success: true, stdout: "ok" } };
        }
      },
    });

    const tool = createExecTool({
      host: "node",
      ask: "always",
      approvalRunningNoticeMs: 0,
      sessionKey: "agent:main:main",
    });

    const result = await tool.execute("call1", { command: "ls -la" });
    const details = expectPendingApprovalText(result, {
      command: "ls -la",
      host: "node",
      nodeId: "node-1",
      interactive: true,
    });
    const approvalId = details.approvalId;

    await pollUntil(
      () => (invokeParams as { params?: { runId?: string } } | undefined)?.params?.runId,
      (value) => value === approvalId,
      { timeout: 2_000, interval: 20 },
    );
    expect(
      (invokeParams as { params?: { suppressNotifyOnExit?: boolean } } | undefined)?.params,
    ).toMatchObject({
      suppressNotifyOnExit: true,
    });
    await pollUntil(() => agentParams, Boolean, { timeout: 2_000, interval: 20 });
  });

  it("skips approval when node allowlist is satisfied", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-test-bin-"));
    const binDir = path.join(tempDir, "bin");
    await fs.mkdir(binDir, { recursive: true });
    const exeName = process.platform === "win32" ? "tool.cmd" : "tool";
    const exePath = path.join(binDir, exeName);
    await fs.writeFile(exePath, "");
    if (process.platform !== "win32") {
      await fs.chmod(exePath, 0o755);
    }
    const approvalsFile = {
      version: 1,
      defaults: { security: "allowlist", ask: "on-miss", askFallback: "deny" },
      agents: {
        main: {
          allowlist: [{ pattern: exePath }],
        },
      },
    };

    const calls: string[] = [];
    hoisted.gatewayCallMock.mockImplementation(async (method, _opts, params) => {
      calls.push(method);
      if (method === "exec.approvals.node.get") {
        return { file: approvalsFile };
      }
      if (method === "node.invoke") {
        const invoke = params as { command?: string };
        if (invoke.command === "system.run.prepare") {
          return buildPreparedSystemRunPayload(params);
        }
        return { payload: { success: true, stdout: "ok" } };
      }
      // exec.approval.request should NOT be called when allowlist is satisfied
      return { ok: true };
    });

    const tool = createExecTool({
      host: "node",
      ask: "on-miss",
      approvalRunningNoticeMs: 0,
    });

    const result = await tool.execute("call2", {
      command: `"${exePath}" --help`,
    });
    expect(result.details.status).toBe("completed");
    expect(calls).toContain("exec.approvals.node.get");
    expect(calls).toContain("node.invoke");
    expect(calls).not.toContain("exec.approval.request");
  });

  it("honors ask=off for elevated gateway exec without prompting", async () => {
    const calls: string[] = [];
    hoisted.gatewayCallMock.mockImplementation(async (method) => {
      calls.push(method);
      return { ok: true };
    });

    const tool = createExecTool({
      ask: "off",
      security: "full",
      approvalRunningNoticeMs: 0,
      elevated: { enabled: true, allowed: true, defaultLevel: "ask" },
    });

    const result = await tool.execute("call3", { command: "echo ok", elevated: true });
    expect(result.details.status).toBe("completed");
    expect(calls).not.toContain("exec.approval.request");
  });

  it("uses exec-approvals ask=off to suppress gateway prompts", async () => {
    await expectGatewayExecWithoutApproval({
      config: {
        version: 1,
        defaults: { security: "full", ask: "off", askFallback: "full" },
        agents: {
          main: { security: "full", ask: "off", askFallback: "full" },
        },
      },
      command: "echo ok",
      ask: "on-miss",
    });
  });

  it("inherits ask=off from exec-approvals defaults when tool ask is unset", async () => {
    await expectGatewayExecWithoutApproval({
      config: {
        version: 1,
        defaults: { security: "full", ask: "off", askFallback: "full" },
        agents: {},
      },
      command: "echo ok",
    });
  });

  it("requires approval for elevated ask when allowlist misses", async () => {
    const calls: string[] = [];
    let resolveApproval: (() => void) | undefined;
    const approvalSeen = new Promise<void>((resolve) => {
      resolveApproval = resolve;
    });

    hoisted.gatewayCallMock.mockImplementation(async (method, _opts, params) => {
      calls.push(method);
      if (method === "exec.approval.request") {
        resolveApproval?.();
        // Return registration confirmation
        return acceptedApprovalResponse(params);
      }
      if (method === "exec.approval.waitDecision") {
        return { decision: "deny" };
      }
      return { ok: true };
    });

    const tool = createElevatedAllowlistExecTool();

    const result = await tool.execute("call4", { command: "echo ok", elevated: true });
    expectPendingApprovalText(result, { command: "echo ok", host: "gateway" });
    await approvalSeen;
    expect(calls).toContain("exec.approval.request");
    expect(calls).toContain("exec.approval.waitDecision");
  });

  it("starts an internal agent follow-up after approved gateway exec completes without an external route", async () => {
    const agentCalls: Array<Record<string, unknown>> = [];

    mockAcceptedApprovalFlow({
      onAgent: (params) => {
        agentCalls.push(params);
      },
    });

    const tool = createExecTool({
      host: "gateway",
      ask: "always",
      approvalRunningNoticeMs: 0,
      sessionKey: "agent:main:main",
      elevated: { enabled: true, allowed: true, defaultLevel: "ask" },
    });

    const result = await tool.execute("call-gw-followup", {
      command: "echo ok",
      workdir: process.cwd(),
      gatewayUrl: undefined,
      gatewayToken: undefined,
    });

    expect(result.details.status).toBe("approval-pending");
    await pollUntil(() => agentCalls.length, (value) => value === 1, {
      timeout: 3_000,
      interval: 20,
    });
    expect(agentCalls[0]).toEqual(
      expect.objectContaining({
        sessionKey: "agent:main:main",
        deliver: false,
        idempotencyKey: expect.stringContaining("exec-approval-followup:"),
      }),
    );
    expect(typeof agentCalls[0]?.message).toBe("string");
    expect(agentCalls[0]?.message).toContain(
      "An async command the user already approved has completed.",
    );
  });

  it("executes approved commands and emits a session-only followup in webchat-only mode", async () => {
    const agentCalls: Array<Record<string, unknown>> = [];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-exec-followup-sidefx-"));
    const markerPath = path.join(tempDir, "marker.txt");

    mockAcceptedApprovalFlow({
      onAgent: (params) => {
        agentCalls.push(params);
      },
    });

    const tool = createExecTool({
      host: "gateway",
      ask: "always",
      approvalRunningNoticeMs: 0,
      sessionKey: "agent:main:main",
      elevated: { enabled: true, allowed: true, defaultLevel: "ask" },
    });

    const result = await tool.execute("call-gw-followup-webchat", {
      command: "node -e \"require('node:fs').writeFileSync('marker.txt','ok')\"",
      workdir: tempDir,
      gatewayUrl: undefined,
      gatewayToken: undefined,
    });

    expect(result.details.status).toBe("approval-pending");

    await pollUntil(() => agentCalls.length, (count) => count === 1, {
      timeout: 3_000,
      interval: 20,
    });
    expect(agentCalls[0]).toEqual(
      expect.objectContaining({
        sessionKey: "agent:main:main",
        deliver: false,
      }),
    );

    const markerText = await pollUntil(
      async () => {
        try {
          return await fs.readFile(markerPath, "utf8");
        } catch {
          return "";
        }
      },
      (text) => text === "ok",
      { timeout: 5_000, interval: 50 },
    );
    expect(markerText).toBe("ok");
  });

  it("uses a deny-specific followup prompt so prior output is not reused", async () => {
    const agentCalls: Array<Record<string, unknown>> = [];

    hoisted.gatewayCallMock.mockImplementation(async (method, _opts, params) => {
      if (method === "exec.approval.request") {
        return acceptedApprovalResponse(params);
      }
      if (method === "exec.approval.waitDecision") {
        return { decision: "deny" };
      }
      if (method === "agent") {
        agentCalls.push(params as Record<string, unknown>);
        return { status: "ok" };
      }
      return { ok: true };
    });

    const tool = createExecTool({
      host: "gateway",
      ask: "always",
      approvalRunningNoticeMs: 0,
      sessionKey: "agent:main:main",
      elevated: { enabled: true, allowed: true, defaultLevel: "ask" },
    });

    const result = await tool.execute("call-gw-followup-deny", {
      command: "echo ok",
      workdir: process.cwd(),
      gatewayUrl: undefined,
      gatewayToken: undefined,
    });

    expect(result.details.status).toBe("approval-pending");
    await pollUntil(() => agentCalls.length, (value) => value === 1, {
      timeout: 3_000,
      interval: 20,
    });
    expect(typeof agentCalls[0]?.message).toBe("string");
    expect(agentCalls[0]?.message).toContain("An async command did not run.");
    expect(agentCalls[0]?.message).toContain(
      "Do not mention, summarize, or reuse output from any earlier run in this session.",
    );
    expect(agentCalls[0]?.message).not.toContain(
      "An async command the user already approved has completed.",
    );
  });

  it("requires a separate approval for each elevated command after allow-once", async () => {
    const requestCommands: string[] = [];
    const requestIds: string[] = [];
    const waitIds: string[] = [];

    hoisted.gatewayCallMock.mockImplementation(async (method, _opts, params) => {
      if (method === "exec.approval.request") {
        const request = params as { id?: string; command?: string };
        if (typeof request.command === "string") {
          requestCommands.push(request.command);
        }
        if (typeof request.id === "string") {
          requestIds.push(request.id);
        }
        return acceptedApprovalResponse(request);
      }
      if (method === "exec.approval.waitDecision") {
        const wait = params as { id?: string };
        if (typeof wait.id === "string") {
          waitIds.push(wait.id);
        }
        return { decision: "allow-once" };
      }
      return { ok: true };
    });

    const tool = createElevatedAllowlistExecTool();

    const first = await tool.execute("call-seq-1", {
      command: "npm view diver --json",
      elevated: true,
    });
    const second = await tool.execute("call-seq-2", {
      command: "brew outdated",
      elevated: true,
    });

    expect(first.details.status).toBe("approval-pending");
    expect(second.details.status).toBe("approval-pending");
    expect(requestCommands).toEqual(["npm view diver --json", "brew outdated"]);
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).not.toBe(requestIds[1]);
    expect(waitIds).toEqual(requestIds);
  });

  it("shows full chained gateway commands in approval-pending message", async () => {
    const calls: string[] = [];
    hoisted.gatewayCallMock.mockImplementation(async (method, _opts, params) => {
      calls.push(method);
      if (method === "exec.approval.request") {
        return acceptedApprovalResponse(params);
      }
      if (method === "exec.approval.waitDecision") {
        return { decision: "deny" };
      }
      return { ok: true };
    });

    const tool = createExecTool({
      host: "gateway",
      ask: "on-miss",
      security: "allowlist",
      approvalRunningNoticeMs: 0,
    });

    const result = await tool.execute("call-chain-gateway", {
      command: "npm view diver --json | jq .name && brew outdated",
    });

    expectPendingCommandText(result, "npm view diver --json | jq .name && brew outdated");
    expect(calls).toContain("exec.approval.request");
  });

  it("runs a skill wrapper chain without prompting when the wrapper is allowlisted", async () => {
    if (process.platform === "win32") {
      return;
    }
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skill-wrapper-"));
    try {
      const skillDir = path.join(tempDir, ".openclaw", "skills", "gog");
      const skillPath = path.join(skillDir, "SKILL.md");
      const binDir = path.join(tempDir, "bin");
      const wrapperPath = path.join(binDir, "gog-wrapper");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(skillPath, "# gog skill\n");
      await fs.writeFile(wrapperPath, "#!/bin/sh\necho '{\"events\":[]}'\n");
      await fs.chmod(wrapperPath, 0o755);

      await writeExecApprovalsConfig({
        version: 1,
        defaults: { security: "allowlist", ask: "off", askFallback: "deny" },
        agents: {
          main: {
            allowlist: [{ pattern: wrapperPath }],
          },
        },
      });

      const calls: string[] = [];
      mockGatewayOkCalls(calls);

      const tool = createExecTool({
        host: "gateway",
        ask: "off",
        security: "allowlist",
        approvalRunningNoticeMs: 0,
      });

      const result = await tool.execute("call-skill-wrapper", {
        command: `cat ${JSON.stringify(skillPath)} && printf '\\n---CMD---\\n' && ${JSON.stringify(wrapperPath)} calendar events primary --today --json`,
        workdir: tempDir,
      });

      expect(result.details.status).toBe("completed");
      expect(getResultText(result)).toContain('{"events":[]}');
      expect(calls).not.toContain("exec.approval.request");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("shows full chained node commands in approval-pending message", async () => {
    const calls: string[] = [];
    hoisted.gatewayCallMock.mockImplementation(async (method, _opts, params) => {
      calls.push(method);
      if (method === "node.invoke") {
        const invoke = params as { command?: string };
        if (invoke.command === "system.run.prepare") {
          return buildPreparedSystemRunPayload(params);
        }
      }
      return { ok: true };
    });

    const tool = createExecTool({
      host: "node",
      ask: "always",
      security: "full",
      approvalRunningNoticeMs: 0,
    });

    const result = await tool.execute("call-chain-node", {
      command: "npm view diver --json | jq .name && brew outdated",
    });

    expectPendingCommandText(result, "npm view diver --json | jq .name && brew outdated");
    expect(calls).toContain("exec.approval.request");
  });

  it("waits for approval registration before returning approval-pending", async () => {
    const calls: string[] = [];
    let resolveRegistration: ((value: unknown) => void) | undefined;
    const registrationPromise = new Promise<unknown>((resolve) => {
      resolveRegistration = resolve;
    });

    hoisted.gatewayCallMock.mockImplementation(async (method, _opts, params) => {
      calls.push(method);
      if (method === "exec.approval.request") {
        return await registrationPromise;
      }
      if (method === "exec.approval.waitDecision") {
        return { decision: "deny" };
      }
      return { ok: true, id: (params as { id?: string })?.id };
    });

    const tool = createExecTool({
      host: "gateway",
      ask: "on-miss",
      security: "allowlist",
      approvalRunningNoticeMs: 0,
    });

    let settled = false;
    const executePromise = tool.execute("call-registration-gate", { command: "echo register" });
    void executePromise.finally(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveRegistration?.({ status: "accepted", id: "approval-id" });
    const result = await executePromise;
    expect(result.details.status).toBe("approval-pending");
    expect(calls[0]).toBe("exec.approval.request");
    expect(calls).toContain("exec.approval.waitDecision");
  });

  it("fails fast when approval registration fails", async () => {
    hoisted.gatewayCallMock.mockImplementation(async (method) => {
      if (method === "exec.approval.request") {
        throw new Error("gateway offline");
      }
      return { ok: true };
    });

    const tool = createExecTool({
      host: "gateway",
      ask: "on-miss",
      security: "allowlist",
      approvalRunningNoticeMs: 0,
    });

    await expect(tool.execute("call-registration-fail", { command: "echo fail" })).rejects.toThrow(
      "Exec approval registration failed",
    );
  });

  it("shows a local /approve prompt when discord exec approvals are disabled", async () => {
    await writeOpenClawConfig({
      channels: {
        discord: {
          enabled: true,
          execApprovals: { enabled: false },
        },
      },
    });

    mockPendingApprovalRegistration();

    const tool = createExecTool({
      host: "gateway",
      ask: "always",
      approvalRunningNoticeMs: 0,
      messageProvider: "discord",
      accountId: "default",
      currentChannelId: "1234567890",
    });

    const result = await tool.execute("call-unavailable", {
      command: "npm view diver name version description",
    });

    expectPendingApprovalText(result, {
      command: "npm view diver name version description",
      host: "gateway",
    });
  });

  it("keeps Telegram approvals in the initiating chat even when Discord DM approvals are also enabled", async () => {
    await writeOpenClawConfig(
      {
        channels: {
          telegram: {
            enabled: true,
            execApprovals: { enabled: false },
          },
          discord: {
            enabled: true,
            execApprovals: { enabled: true, approvers: ["123"], target: "dm" },
          },
        },
      },
      true,
    );

    mockPendingApprovalRegistration();

    const tool = createExecTool({
      host: "gateway",
      ask: "always",
      approvalRunningNoticeMs: 0,
      messageProvider: "telegram",
      accountId: "default",
      currentChannelId: "-1003841603622",
    });

    const result = await tool.execute("call-tg-unavailable", {
      command: "npm view diver name version description",
    });

    const details = expectPendingApprovalText(result, {
      command: "npm view diver name version description",
      host: "gateway",
    });
    expect(getResultText(result)).toContain(`/approve ${details.approvalSlug} allow-once`);
    expect(getResultText(result)).not.toContain(getExecApprovalApproverDmNoticeText());
  });

  it("denies node obfuscated command when approval request times out", async () => {
    hoisted.detectCommandObfuscationMock.mockReturnValue({
      detected: true,
      reasons: ["Content piped directly to shell interpreter"],
      matchedPatterns: ["pipe-to-shell"],
    });

    const calls: string[] = [];
    const nodeInvokeCommands: string[] = [];
    hoisted.gatewayCallMock.mockImplementation(async (method, _opts, params) => {
      calls.push(method);
      if (method === "exec.approval.request") {
        return { status: "accepted", id: "approval-id" };
      }
      if (method === "exec.approval.waitDecision") {
        return {};
      }
      if (method === "node.invoke") {
        const invoke = params as { command?: string };
        if (invoke.command) {
          nodeInvokeCommands.push(invoke.command);
        }
        if (invoke.command === "system.run.prepare") {
          return buildPreparedSystemRunPayload(params);
        }
        return { payload: { success: true, stdout: "should-not-run" } };
      }
      return { ok: true };
    });

    const tool = createExecTool({
      host: "node",
      ask: "off",
      security: "full",
      approvalRunningNoticeMs: 0,
    });

    const result = await tool.execute("call5", { command: "echo hi | sh" });
    expect(result.details.status).toBe("approval-pending");
    await pollUntil(() => nodeInvokeCommands.includes("system.run"), (value) => value === false, {
      timeout: 1_000,
      interval: 20,
    });
  });

  it("denies gateway obfuscated command when approval request times out", async () => {
    if (process.platform === "win32") {
      return;
    }

    hoisted.detectCommandObfuscationMock.mockReturnValue({
      detected: true,
      reasons: ["Content piped directly to shell interpreter"],
      matchedPatterns: ["pipe-to-shell"],
    });

    hoisted.gatewayCallMock.mockImplementation(async (method) => {
      if (method === "exec.approval.request") {
        return { status: "accepted", id: "approval-id" };
      }
      if (method === "exec.approval.waitDecision") {
        return {};
      }
      return { ok: true };
    });

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-test-obf-"));
    const markerPath = path.join(tempDir, "ran.txt");
    const tool = createExecTool({
      host: "gateway",
      ask: "off",
      security: "full",
      approvalRunningNoticeMs: 0,
    });

    const result = await tool.execute("call6", {
      command: `echo touch ${JSON.stringify(markerPath)} | sh`,
    });
    expect(result.details.status).toBe("approval-pending");
    await pollUntil(
      async () => {
        try {
          await fs.access(markerPath);
          return true;
        } catch {
          return false;
        }
      },
      (value) => value === false,
      { timeout: 1_000, interval: 20 },
    );
  });
});
