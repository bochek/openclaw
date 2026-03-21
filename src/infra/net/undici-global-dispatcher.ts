import * as net from "node:net";
import * as tls from "node:tls";
import { Agent, EnvHttpProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { hasEnvHttpProxyConfigured } from "./proxy-env.js";

export const DEFAULT_UNDICI_STREAM_TIMEOUT_MS = 30 * 60 * 1000;

const AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 300;

let lastAppliedTimeoutKey: string | null = null;
let lastAppliedProxyBootstrap = false;

type DispatcherKind = "agent" | "env-proxy" | "unsupported";

function resolveDispatcherKind(dispatcher: unknown): DispatcherKind {
  const ctorName = (dispatcher as { constructor?: { name?: string } })?.constructor?.name;
  if (typeof ctorName !== "string" || ctorName.length === 0) {
    return "unsupported";
  }
  if (ctorName.includes("EnvHttpProxyAgent")) {
    return "env-proxy";
  }
  if (ctorName.includes("ProxyAgent")) {
    return "unsupported";
  }
  if (ctorName.includes("Agent")) {
    return "agent";
  }
  return "unsupported";
}

function resolveAutoSelectFamily(): boolean | undefined {
  if (typeof net.getDefaultAutoSelectFamily !== "function") {
    return undefined;
  }
  try {
    return net.getDefaultAutoSelectFamily();
  } catch {
    return undefined;
  }
}

function resolveConnectOptions(
  autoSelectFamily: boolean | undefined,
): { autoSelectFamily: boolean; autoSelectFamilyAttemptTimeout: number } | undefined {
  if (autoSelectFamily === undefined) {
    return undefined;
  }
  return {
    autoSelectFamily,
    autoSelectFamilyAttemptTimeout: AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS,
  };
}

let cachedCaCertificates: string[] | null | undefined;

function resolveCaCertificates(): string[] | undefined {
  if (cachedCaCertificates !== undefined) {
    return cachedCaCertificates ?? undefined;
  }
  if (typeof tls.getCACertificates !== "function") {
    cachedCaCertificates = null;
    return undefined;
  }
  try {
    const unique = new Set<string>();
    for (const source of ["bundled", "system", "extra"] as const) {
      for (const cert of tls.getCACertificates(source)) {
        const trimmed = cert.trim();
        if (trimmed) {
          unique.add(trimmed);
        }
      }
    }
    cachedCaCertificates = unique.size > 0 ? Array.from(unique) : null;
    return cachedCaCertificates ?? undefined;
  } catch {
    cachedCaCertificates = null;
    return undefined;
  }
}

function resolveAgentConnectOptions(
  autoSelectFamily: boolean | undefined,
):
  | ({ autoSelectFamily?: boolean; autoSelectFamilyAttemptTimeout?: number } & { ca?: string[] })
  | undefined {
  const connect = resolveConnectOptions(autoSelectFamily);
  const ca = resolveCaCertificates();
  if (!connect && !ca) {
    return undefined;
  }
  return {
    ...connect,
    ...(ca ? { ca } : {}),
  };
}

function resolveProxyTlsOptions(): { ca: string[] } | undefined {
  const ca = resolveCaCertificates();
  if (!ca) {
    return undefined;
  }
  return { ca };
}

function resolveDispatcherKey(params: {
  kind: DispatcherKind;
  timeoutMs: number;
  autoSelectFamily: boolean | undefined;
}): string {
  const autoSelectToken =
    params.autoSelectFamily === undefined ? "na" : params.autoSelectFamily ? "on" : "off";
  return `${params.kind}:${params.timeoutMs}:${autoSelectToken}`;
}

function resolveCurrentDispatcherKind(): DispatcherKind | null {
  let dispatcher: unknown;
  try {
    dispatcher = getGlobalDispatcher();
  } catch {
    return null;
  }

  const currentKind = resolveDispatcherKind(dispatcher);
  return currentKind === "unsupported" ? null : currentKind;
}

export function ensureGlobalUndiciEnvProxyDispatcher(): void {
  const shouldUseEnvProxy = hasEnvHttpProxyConfigured("https");
  if (!shouldUseEnvProxy) {
    return;
  }
  if (lastAppliedProxyBootstrap) {
    if (resolveCurrentDispatcherKind() === "env-proxy") {
      return;
    }
    lastAppliedProxyBootstrap = false;
  }
  const currentKind = resolveCurrentDispatcherKind();
  if (currentKind === null) {
    return;
  }
  if (currentKind === "env-proxy") {
    lastAppliedProxyBootstrap = true;
    return;
  }
  try {
    const connect = resolveConnectOptions(resolveAutoSelectFamily());
    const requestTls = resolveProxyTlsOptions();
    setGlobalDispatcher(
      new EnvHttpProxyAgent({
        ...(connect ? { connect } : {}),
        ...(requestTls ? { requestTls, proxyTls: requestTls } : {}),
      }),
    );
    lastAppliedProxyBootstrap = true;
  } catch {
    // Best-effort bootstrap only.
  }
}

export function ensureGlobalUndiciStreamTimeouts(opts?: { timeoutMs?: number }): void {
  const timeoutMsRaw = opts?.timeoutMs ?? DEFAULT_UNDICI_STREAM_TIMEOUT_MS;
  const timeoutMs = Math.max(1, Math.floor(timeoutMsRaw));
  if (!Number.isFinite(timeoutMsRaw)) {
    return;
  }
  const kind = resolveCurrentDispatcherKind();
  if (kind === null) {
    return;
  }

  const autoSelectFamily = resolveAutoSelectFamily();
  const nextKey = resolveDispatcherKey({ kind, timeoutMs, autoSelectFamily });
  if (lastAppliedTimeoutKey === nextKey) {
    return;
  }

  const connect = resolveAgentConnectOptions(autoSelectFamily);
  const requestTls = resolveProxyTlsOptions();
  try {
    if (kind === "env-proxy") {
      const proxyOptions = {
        bodyTimeout: timeoutMs,
        headersTimeout: timeoutMs,
        ...(connect ? { connect } : {}),
        ...(requestTls ? { requestTls, proxyTls: requestTls } : {}),
      } as ConstructorParameters<typeof EnvHttpProxyAgent>[0];
      setGlobalDispatcher(new EnvHttpProxyAgent(proxyOptions));
    } else {
      setGlobalDispatcher(
        new Agent({
          bodyTimeout: timeoutMs,
          headersTimeout: timeoutMs,
          ...(connect ? { connect } : {}),
        }),
      );
    }
    lastAppliedTimeoutKey = nextKey;
  } catch {
    // Best-effort hardening only.
  }
}

export function resetGlobalUndiciStreamTimeoutsForTests(): void {
  lastAppliedTimeoutKey = null;
  lastAppliedProxyBootstrap = false;
  cachedCaCertificates = undefined;
}
