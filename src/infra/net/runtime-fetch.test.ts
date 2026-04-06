import { afterEach, describe, it, vi } from "vitest";
import {
  createTranscriptionForm,
  expectNormalizedMultipartBody,
  MockRuntimeFormData,
} from "./undici-formdata.test-helpers.js";
import { TEST_UNDICI_RUNTIME_DEPS_KEY } from "./undici-runtime.js";

describe("fetchWithRuntimeDispatcher", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis as object, TEST_UNDICI_RUNTIME_DEPS_KEY);
  });

  it("normalizes ambient FormData before calling undici fetch", async () => {
    const runtimeFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    (globalThis as Record<string, unknown>)[TEST_UNDICI_RUNTIME_DEPS_KEY] = {
      Agent: class MockAgent {},
      EnvHttpProxyAgent: class MockEnvHttpProxyAgent {},
      FormData: MockRuntimeFormData,
      ProxyAgent: class MockProxyAgent {},
      fetch: runtimeFetch,
    };

    const { fetchWithRuntimeDispatcher } = await import("./runtime-fetch.js");
    await fetchWithRuntimeDispatcher("https://example.com/upload", {
      method: "POST",
      body: createTranscriptionForm(),
    });

    const [, init] = runtimeFetch.mock.calls[0] as unknown as [
      string,
      RequestInit & { body?: unknown },
    ];
    expectNormalizedMultipartBody({
      body: init.body,
      formDataCtor: MockRuntimeFormData,
      expectedFileName: "note.wav",
    });
  });
});
