import type { GuardedFetchResult } from "../infra/net/fetch-guard.js";
import { fetchWithSsrFGuard } from "../infra/net/fetch-guard.js";
import type { LookupFn, PinnedDispatcherPolicy, SsrFPolicy } from "../infra/net/ssrf.js";

const DEFAULT_GUARDED_HTTP_TIMEOUT_MS = 60_000;
const MAX_AUDIT_CONTEXT_CHARS = 80;

export type GuardedFetchOptions = {
  ssrfPolicy?: SsrFPolicy;
  lookupFn?: LookupFn;
  pinDns?: boolean;
  dispatcherPolicy?: PinnedDispatcherPolicy;
  auditContext?: string;
};

export type GuardedPostParams = {
  url: string;
  headers: Headers;
  body: BodyInit;
  timeoutMs?: number;
  fetchFn: typeof fetch;
  pinDns?: boolean;
  allowPrivateNetwork?: boolean;
  dispatcherPolicy?: PinnedDispatcherPolicy;
  auditContext?: string;
};

function resolveGuardedHttpTimeoutMs(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_GUARDED_HTTP_TIMEOUT_MS;
  }
  return timeoutMs;
}

function sanitizeAuditContext(auditContext: string | undefined): string | undefined {
  const cleaned = auditContext
    ?.replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return undefined;
  }
  return cleaned.slice(0, MAX_AUDIT_CONTEXT_CHARS);
}

function buildGuardedFetchOptions(
  params: Pick<
    GuardedPostParams,
    "allowPrivateNetwork" | "pinDns" | "dispatcherPolicy" | "auditContext"
  >,
): GuardedFetchOptions | undefined {
  const auditContext = sanitizeAuditContext(params.auditContext);
  if (
    !params.allowPrivateNetwork &&
    !params.dispatcherPolicy &&
    params.pinDns === undefined &&
    !auditContext
  ) {
    return undefined;
  }
  return {
    ...(params.allowPrivateNetwork ? { ssrfPolicy: { allowPrivateNetwork: true } } : {}),
    ...(params.pinDns !== undefined ? { pinDns: params.pinDns } : {}),
    ...(params.dispatcherPolicy ? { dispatcherPolicy: params.dispatcherPolicy } : {}),
    ...(auditContext ? { auditContext } : {}),
  };
}

export async function fetchWithTimeoutGuarded(
  url: string,
  init: RequestInit,
  timeoutMs: number | undefined,
  fetchFn: typeof fetch,
  options?: GuardedFetchOptions,
): Promise<GuardedFetchResult> {
  return await fetchWithSsrFGuard({
    url,
    fetchImpl: fetchFn,
    init,
    timeoutMs: resolveGuardedHttpTimeoutMs(timeoutMs),
    policy: options?.ssrfPolicy,
    lookupFn: options?.lookupFn,
    pinDns: options?.pinDns,
    dispatcherPolicy: options?.dispatcherPolicy,
    auditContext: sanitizeAuditContext(options?.auditContext),
  });
}

async function postGuardedRequest(params: GuardedPostParams): Promise<GuardedFetchResult> {
  return fetchWithTimeoutGuarded(
    params.url,
    {
      method: "POST",
      headers: params.headers,
      body: params.body,
    },
    params.timeoutMs,
    params.fetchFn,
    buildGuardedFetchOptions(params),
  );
}

export async function postTranscriptionRequest(params: GuardedPostParams) {
  return postGuardedRequest(params);
}

export async function postJsonRequest(
  params: Omit<GuardedPostParams, "body"> & {
    body: unknown;
  },
) {
  return postGuardedRequest({
    ...params,
    body: JSON.stringify(params.body),
  });
}
