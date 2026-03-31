import { afterEach, describe, expect, it, vi } from "vitest";
import { __testing, probeGatewayStatus } from "./probe.js";

const callGatewayMock = vi.hoisted(() => vi.fn());
const probeGatewayMock = vi.hoisted(() => vi.fn());

describe("probeGatewayStatus", () => {
  afterEach(() => {
    __testing.resetDepsForTest();
  });

  it("uses lightweight token-only probing for daemon status", async () => {
    callGatewayMock.mockReset();
    probeGatewayMock.mockResolvedValueOnce({ ok: true });
    __testing.setDepsForTest({
      callGateway: async (params) => await callGatewayMock(params),
      probeGateway: async (params) => await probeGatewayMock(params),
    });

    const result = await probeGatewayStatus({
      url: "ws://127.0.0.1:19191",
      token: "temp-token",
      tlsFingerprint: "abc123",
      timeoutMs: 5_000,
      json: true,
    });

    expect(result).toEqual({ ok: true });
    expect(callGatewayMock).not.toHaveBeenCalled();
    expect(probeGatewayMock).toHaveBeenCalledWith({
      url: "ws://127.0.0.1:19191",
      auth: {
        token: "temp-token",
        password: undefined,
      },
      tlsFingerprint: "abc123",
      timeoutMs: 5_000,
      includeDetails: false,
    });
  });

  it("uses a real status RPC when requireRpc is enabled", async () => {
    callGatewayMock.mockReset();
    probeGatewayMock.mockReset();
    callGatewayMock.mockResolvedValueOnce({ status: "ok" });
    __testing.setDepsForTest({
      callGateway: async (params) => await callGatewayMock(params),
      probeGateway: async (params) => await probeGatewayMock(params),
    });

    const result = await probeGatewayStatus({
      url: "ws://127.0.0.1:19191",
      token: "temp-token",
      tlsFingerprint: "abc123",
      timeoutMs: 5_000,
      json: true,
      requireRpc: true,
      configPath: "/tmp/openclaw-daemon/openclaw.json",
    });

    expect(result).toEqual({ ok: true });
    expect(probeGatewayMock).not.toHaveBeenCalled();
    expect(callGatewayMock).toHaveBeenCalledWith({
      url: "ws://127.0.0.1:19191",
      token: "temp-token",
      password: undefined,
      tlsFingerprint: "abc123",
      method: "status",
      timeoutMs: 5_000,
      configPath: "/tmp/openclaw-daemon/openclaw.json",
    });
  });

  it("surfaces probe close details when the handshake fails", async () => {
    callGatewayMock.mockReset();
    probeGatewayMock.mockReset();
    probeGatewayMock.mockResolvedValueOnce({
      ok: false,
      error: null,
      close: { code: 1008, reason: "pairing required" },
    });
    __testing.setDepsForTest({
      callGateway: async (params) => await callGatewayMock(params),
      probeGateway: async (params) => await probeGatewayMock(params),
    });

    const result = await probeGatewayStatus({
      url: "ws://127.0.0.1:19191",
      timeoutMs: 5_000,
    });

    expect(result).toEqual({
      ok: false,
      error: "gateway closed (1008): pairing required",
    });
  });

  it("prefers the close reason over a generic timeout when both are present", async () => {
    callGatewayMock.mockReset();
    probeGatewayMock.mockReset();
    probeGatewayMock.mockResolvedValueOnce({
      ok: false,
      error: "timeout",
      close: { code: 1008, reason: "pairing required" },
    });
    __testing.setDepsForTest({
      callGateway: async (params) => await callGatewayMock(params),
      probeGateway: async (params) => await probeGatewayMock(params),
    });

    const result = await probeGatewayStatus({
      url: "ws://127.0.0.1:19191",
      timeoutMs: 5_000,
    });

    expect(result).toEqual({
      ok: false,
      error: "gateway closed (1008): pairing required",
    });
  });

  it("surfaces status RPC errors when requireRpc is enabled", async () => {
    callGatewayMock.mockReset();
    probeGatewayMock.mockReset();
    callGatewayMock.mockRejectedValueOnce(new Error("missing scope: operator.admin"));
    __testing.setDepsForTest({
      callGateway: async (params) => await callGatewayMock(params),
      probeGateway: async (params) => await probeGatewayMock(params),
    });

    const result = await probeGatewayStatus({
      url: "ws://127.0.0.1:19191",
      token: "temp-token",
      timeoutMs: 5_000,
      requireRpc: true,
    });

    expect(result).toEqual({
      ok: false,
      error: "missing scope: operator.admin",
    });
    expect(probeGatewayMock).not.toHaveBeenCalled();
  });
});
