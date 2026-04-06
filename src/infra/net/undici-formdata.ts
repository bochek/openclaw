import { loadUndiciRuntimeDeps } from "./undici-runtime.js";

type UndiciCompatibleFetch = (input: RequestInfo | URL, init?: unknown) => Promise<unknown>;

type DispatcherResolver<TInit extends RequestInit> = (init?: TInit) => TInit;

/**
 * Keep undici-backed fetch wrappers compatible with callers that construct
 * multipart bodies through the ambient global fetch APIs.
 */
export function normalizeUndiciRequestInit<TInit extends RequestInit>(
  init: TInit | undefined,
): TInit | undefined {
  if (!init?.body) {
    return init;
  }

  const GlobalFormData = globalThis.FormData;
  const { FormData: UndiciFormData } = loadUndiciRuntimeDeps();
  const sharesFormDataCtor =
    typeof GlobalFormData === "function" &&
    GlobalFormData === (UndiciFormData as unknown as typeof GlobalFormData);
  if (
    typeof GlobalFormData !== "function" ||
    sharesFormDataCtor ||
    !(init.body instanceof GlobalFormData) ||
    init.body instanceof UndiciFormData
  ) {
    return init;
  }

  const normalizedBody = new UndiciFormData();
  for (const [key, value] of init.body.entries()) {
    if (typeof value === "string") {
      normalizedBody.append(key, value);
      continue;
    }
    const fileName = "name" in value && typeof value.name === "string" ? value.name : undefined;
    normalizedBody.append(key, value, fileName);
  }

  return {
    ...init,
    body: normalizedBody as unknown as BodyInit,
  } as TInit;
}

export async function callUndiciFetch<TInit extends RequestInit>(
  fetchImpl: UndiciCompatibleFetch,
  input: RequestInfo | URL,
  init?: TInit,
): Promise<Response> {
  return (await fetchImpl(input, normalizeUndiciRequestInit(init))) as Response;
}

export function createUndiciDispatcherFetch<TInit extends RequestInit>(params: {
  fetchImpl: UndiciCompatibleFetch;
  resolveInit: DispatcherResolver<TInit>;
}): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    callUndiciFetch(
      params.fetchImpl,
      input,
      params.resolveInit(init as TInit | undefined),
    )) as typeof fetch;
}
