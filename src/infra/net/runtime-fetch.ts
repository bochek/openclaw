import type { Dispatcher } from "undici";
import { loadUndiciRuntimeDeps } from "./undici-runtime.js";

export type DispatcherAwareRequestInit = RequestInit & { dispatcher?: Dispatcher };

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function normalizeRuntimeRequestBody(
  body: BodyInit | null | undefined,
): BodyInit | null | undefined {
  if (typeof FormData === "undefined" || !(body instanceof FormData)) {
    return body;
  }
  const runtimeForm = new (loadUndiciRuntimeDeps().FormData)();
  for (const [key, value] of body.entries()) {
    if (typeof value === "string") {
      runtimeForm.append(key, value);
      continue;
    }
    const fileName =
      typeof (value as { name?: unknown }).name === "string" ? value.name : undefined;
    runtimeForm.append(key, value, fileName);
  }
  return runtimeForm as unknown as BodyInit;
}

function normalizeRuntimeRequestInit(
  init: DispatcherAwareRequestInit | undefined,
): DispatcherAwareRequestInit | undefined {
  if (!init) {
    return init;
  }
  return {
    ...init,
    body: normalizeRuntimeRequestBody(init.body),
  };
}

export function isMockedFetch(fetchImpl: FetchLike | undefined): boolean {
  if (typeof fetchImpl !== "function") {
    return false;
  }
  return typeof (fetchImpl as FetchLike & { mock?: unknown }).mock === "object";
}

export async function fetchWithRuntimeDispatcher(
  input: RequestInfo | URL,
  init?: DispatcherAwareRequestInit,
): Promise<Response> {
  const runtimeFetch = loadUndiciRuntimeDeps().fetch as unknown as (
    input: RequestInfo | URL,
    init?: DispatcherAwareRequestInit,
  ) => Promise<unknown>;
  return (await runtimeFetch(input, normalizeRuntimeRequestInit(init))) as Response;
}
