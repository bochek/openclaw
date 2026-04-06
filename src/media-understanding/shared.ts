import type {
  ProviderRequestCapability,
  ProviderRequestTransport,
} from "../agents/provider-attribution.js";
import {
  buildProviderRequestDispatcherPolicy,
  normalizeBaseUrl,
  resolveProviderRequestPolicyConfig,
  type ProviderRequestTransportOverrides,
  type ResolvedProviderRequestConfig,
} from "../agents/provider-request-config.js";
import type { PinnedDispatcherPolicy } from "../infra/net/ssrf.js";
export {
  fetchWithTimeoutGuarded,
  postJsonRequest,
  postTranscriptionRequest,
  type GuardedFetchOptions,
  type GuardedPostParams,
} from "./guarded-http.js";
export { fetchWithTimeout } from "../utils/fetch-timeout.js";
export { normalizeBaseUrl } from "../agents/provider-request-config.js";

const MAX_ERROR_CHARS = 300;
const MAX_ERROR_RESPONSE_BYTES = 4096;

export function resolveProviderHttpRequestConfig(params: {
  baseUrl?: string;
  defaultBaseUrl: string;
  allowPrivateNetwork?: boolean;
  headers?: HeadersInit;
  defaultHeaders?: Record<string, string>;
  request?: ProviderRequestTransportOverrides;
  provider?: string;
  api?: string;
  capability?: ProviderRequestCapability;
  transport?: ProviderRequestTransport;
}): {
  baseUrl: string;
  allowPrivateNetwork: boolean;
  headers: Headers;
  dispatcherPolicy?: PinnedDispatcherPolicy;
  requestConfig: ResolvedProviderRequestConfig;
} {
  const requestConfig = resolveProviderRequestPolicyConfig({
    provider: params.provider ?? "",
    baseUrl: params.baseUrl,
    defaultBaseUrl: params.defaultBaseUrl,
    capability: params.capability ?? "other",
    transport: params.transport ?? "http",
    callerHeaders: params.headers
      ? Object.fromEntries(new Headers(params.headers).entries())
      : undefined,
    providerHeaders: params.defaultHeaders,
    precedence: "caller-wins",
    allowPrivateNetwork: params.allowPrivateNetwork,
    api: params.api,
    request: params.request,
  });
  const headers = new Headers(requestConfig.headers);
  if (!requestConfig.baseUrl) {
    throw new Error("Missing baseUrl: provide baseUrl or defaultBaseUrl");
  }

  return {
    baseUrl: requestConfig.baseUrl,
    allowPrivateNetwork: requestConfig.allowPrivateNetwork,
    headers,
    dispatcherPolicy: buildProviderRequestDispatcherPolicy(requestConfig),
    requestConfig,
  };
}

export async function readErrorResponse(res: Response): Promise<string | undefined> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (!res.body) {
      return undefined;
    }
    reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let sawBytes = false;
    while (total < MAX_ERROR_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.length === 0) {
        continue;
      }
      sawBytes = true;
      const remaining = MAX_ERROR_RESPONSE_BYTES - total;
      const chunk = value.length <= remaining ? value : value.subarray(0, remaining);
      chunks.push(chunk);
      total += chunk.length;
      if (chunk.length < value.length) {
        break;
      }
    }
    if (!sawBytes) {
      return undefined;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder().decode(bytes);
    const collapsed = text.replace(/\s+/g, " ").trim();
    if (!collapsed) {
      return undefined;
    }
    if (collapsed.length <= MAX_ERROR_CHARS) {
      return collapsed;
    }
    return `${collapsed.slice(0, MAX_ERROR_CHARS)}…`;
  } catch {
    return undefined;
  } finally {
    try {
      await reader?.cancel();
    } catch {
      // Ignore stream-cancel failures while reporting the original HTTP error.
    }
  }
}

export async function assertOkOrThrowHttpError(res: Response, label: string): Promise<void> {
  if (res.ok) {
    return;
  }
  const detail = await readErrorResponse(res);
  const suffix = detail ? `: ${detail}` : "";
  throw new Error(`${label} (HTTP ${res.status})${suffix}`);
}

export function requireTranscriptionText(
  value: string | undefined,
  missingMessage: string,
): string {
  const text = value?.trim();
  if (!text) {
    throw new Error(missingMessage);
  }
  return text;
}
