import { afterEach, describe, expect, it } from "vitest";
import { captureEnv } from "../test-utils/env.js";
import {
  createRequestCaptureJsonFetch,
  installPinnedHostnameTestHooks,
} from "./audio.test-helpers.js";
import { postJsonRequest, postTranscriptionRequest } from "./shared.js";

installPinnedHostnameTestHooks();

describe("shared provider HTTP helpers", () => {
  const envSnapshot = captureEnv(["OPENCLAW_VERSION"]);

  afterEach(() => {
    envSnapshot.restore();
  });

  it("adds provider attribution defaults for enabled providers", async () => {
    process.env.OPENCLAW_VERSION = "2026.4.2";
    const { fetchFn, getRequest } = createRequestCaptureJsonFetch({ ok: true });

    const { release } = await postJsonRequest({
      url: "https://example.com/v1/test",
      provider: "openai",
      headers: new Headers({ Authorization: "Bearer test" }),
      body: { ok: true },
      timeoutMs: 1000,
      fetchFn,
    });
    await release();

    const headers = new Headers(getRequest().init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test");
    expect(headers.get("originator")).toBe("openclaw");
    expect(headers.get("version")).toBe("2026.4.2");
    expect(headers.get("user-agent")).toBe("openclaw/2026.4.2");
  });

  it("keeps explicit attribution header overrides", async () => {
    process.env.OPENCLAW_VERSION = "2026.4.2";
    const { fetchFn, getRequest } = createRequestCaptureJsonFetch({ text: "ok" });

    const { release } = await postTranscriptionRequest({
      url: "https://example.com/v1/test",
      provider: "openai",
      headers: new Headers({
        originator: "custom-originator",
        "User-Agent": "custom-transcriber/1.0",
      }),
      body: "audio-body",
      timeoutMs: 1000,
      fetchFn,
    });
    await release();

    const headers = new Headers(getRequest().init?.headers);
    expect(headers.get("originator")).toBe("custom-originator");
    expect(headers.get("user-agent")).toBe("custom-transcriber/1.0");
  });

  it("does not widen attribution for unverified providers", async () => {
    process.env.OPENCLAW_VERSION = "2026.4.2";
    const { fetchFn, getRequest } = createRequestCaptureJsonFetch({ ok: true });

    const { release } = await postJsonRequest({
      url: "https://example.com/v1/test",
      provider: "google",
      headers: new Headers(),
      body: { ok: true },
      timeoutMs: 1000,
      fetchFn,
    });
    await release();

    const headers = new Headers(getRequest().init?.headers);
    expect(headers.get("originator")).toBeNull();
    expect(headers.get("version")).toBeNull();
    expect(headers.get("user-agent")).toBeNull();
  });
});
