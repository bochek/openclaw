import { withProgress } from "../progress.js";

type ProbeGatewayDeps = {
  callGateway: typeof import("../../gateway/call.js").callGateway;
  probeGateway: typeof import("../../gateway/probe.js").probeGateway;
};

const defaultProbeGatewayDeps: ProbeGatewayDeps = {
  callGateway: async (params) => {
    const { callGateway } = await import("../../gateway/call.js");
    return await callGateway(params);
  },
  probeGateway: async (params) => {
    const { probeGateway } = await import("../../gateway/probe.js");
    return await probeGateway(params);
  },
};

let probeGatewayDeps: ProbeGatewayDeps = defaultProbeGatewayDeps;

function resolveProbeFailureMessage(result: {
  error?: string | null;
  close?: { code: number; reason: string } | null;
}): string {
  const closeHint = result.close
    ? `gateway closed (${result.close.code}): ${result.close.reason}`
    : null;
  if (closeHint && (!result.error || result.error === "timeout")) {
    return closeHint;
  }
  return result.error ?? closeHint ?? "gateway probe failed";
}

export async function probeGatewayStatus(opts: {
  url: string;
  token?: string;
  password?: string;
  tlsFingerprint?: string;
  timeoutMs: number;
  json?: boolean;
  requireRpc?: boolean;
  configPath?: string;
}) {
  try {
    const result = await withProgress(
      {
        label: "Checking gateway status...",
        indeterminate: true,
        enabled: opts.json !== true,
      },
      async () => {
        if (opts.requireRpc) {
          await probeGatewayDeps.callGateway({
            url: opts.url,
            token: opts.token,
            password: opts.password,
            tlsFingerprint: opts.tlsFingerprint,
            method: "status",
            timeoutMs: opts.timeoutMs,
            ...(opts.configPath ? { configPath: opts.configPath } : {}),
          });
          return { ok: true } as const;
        }
        return await probeGatewayDeps.probeGateway({
          url: opts.url,
          auth: {
            token: opts.token,
            password: opts.password,
          },
          tlsFingerprint: opts.tlsFingerprint,
          timeoutMs: opts.timeoutMs,
          includeDetails: false,
        });
      },
    );
    if (result.ok) {
      return { ok: true } as const;
    }
    return {
      ok: false,
      error: resolveProbeFailureMessage(result),
    } as const;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } as const;
  }
}

export const __testing = {
  setDepsForTest(overrides: Partial<ProbeGatewayDeps>): void {
    probeGatewayDeps = { ...defaultProbeGatewayDeps, ...overrides };
  },
  resetDepsForTest(): void {
    probeGatewayDeps = defaultProbeGatewayDeps;
  },
};
