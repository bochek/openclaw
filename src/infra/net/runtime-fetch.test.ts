import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRuntimeDispatcher } from "./runtime-fetch.js";
import { TEST_UNDICI_RUNTIME_DEPS_KEY } from "./undici-runtime.js";

class MockUndiciFormData {
  readonly appended: Array<{ name: string; value: unknown; fileName?: string }> = [];

  append(name: string, value: unknown, fileName?: string) {
    this.appended.push({ name, value, fileName });
  }
}

describe("fetchWithRuntimeDispatcher", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis as object, TEST_UNDICI_RUNTIME_DEPS_KEY);
  });

  it("normalizes global FormData bodies for undici runtime fetch", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = (init as RequestInit & { body?: unknown })?.body;
      expect(body).toBeInstanceOf(MockUndiciFormData);
      const normalized = body as unknown as MockUndiciFormData;
      expect(normalized.appended).toHaveLength(2);
      expect(normalized.appended[0]).toEqual({
        name: "purpose",
        value: "batch",
        fileName: undefined,
      });
      expect(normalized.appended[1]).toMatchObject({
        name: "file",
        fileName: "note.txt",
      });
      return new Response("ok", { status: 200 });
    });

    (globalThis as Record<string, unknown>)[TEST_UNDICI_RUNTIME_DEPS_KEY] = {
      Agent: vi.fn(),
      EnvHttpProxyAgent: vi.fn(),
      FormData: MockUndiciFormData,
      ProxyAgent: vi.fn(),
      fetch: fetchMock,
    };

    const form = new FormData();
    form.append("purpose", "batch");
    form.append("file", new Blob(["hello"], { type: "text/plain" }), "note.txt");

    const response = await fetchWithRuntimeDispatcher("https://example.com/upload", {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
