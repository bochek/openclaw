import { describe, expect, it, vi } from "vitest";

describe("web_search shared cache", () => {
  it("stores cache entries in the shared runtime cache symbol", async () => {
    vi.resetModules();
    delete (globalThis as Record<PropertyKey, unknown>)[Symbol.for("openclaw.web-search.cache")];

    const module = await import("./web-search-provider-common.js");
    const cacheKey = "query:test";
    module.writeCachedSearchPayload(cacheKey, { ok: true }, 60_000);

    expect(module.readCachedSearchPayload(cacheKey)).toEqual({ ok: true, cached: true });
    const sharedCache = module.SEARCH_CACHE;
    expect(sharedCache).toBeInstanceOf(Map);
    expect(sharedCache.has(cacheKey)).toBe(true);
  });
});
