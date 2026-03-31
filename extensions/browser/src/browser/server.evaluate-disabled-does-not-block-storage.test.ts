import { describe, expect, it } from "vitest";
import {
  getBrowserControlServerBaseUrl,
  getPwMocks,
  installBrowserControlServerHooks,
  setBrowserControlServerEvaluateEnabled,
  setBrowserControlServerReachable,
  startBrowserControlServerFromConfig,
} from "./server.control-server.test-harness.js";
import { getBrowserTestFetch } from "./test-fetch.js";

const pwMocks = getPwMocks();

describe("browser control evaluate gating", () => {
  installBrowserControlServerHooks();

  it("blocks act:evaluate but still allows cookies/storage reads", async () => {
    setBrowserControlServerEvaluateEnabled(false);
    setBrowserControlServerReachable(true);
    await startBrowserControlServerFromConfig();
    const realFetch = getBrowserTestFetch();
    const base = getBrowserControlServerBaseUrl();

    const evalRes = (await realFetch(`${base}/act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "evaluate", fn: "() => 1" }),
    }).then((r) => r.json())) as { error?: string };

    expect(evalRes.error).toContain("browser.evaluateEnabled=false");
    expect(pwMocks.evaluateViaPlaywright).not.toHaveBeenCalled();

    const cookiesRes = (await realFetch(`${base}/cookies`).then((r) => r.json())) as {
      ok: boolean;
      targetId?: string;
      cookies?: Array<{ name: string }>;
    };
    expect(cookiesRes.ok).toBe(true);
    expect(cookiesRes.targetId).toBe("abcd1234");
    expect(cookiesRes.cookies?.[0]?.name).toBe("session");
    expect(pwMocks.cookiesGetViaPlaywright).toHaveBeenCalledWith({
      cdpUrl: expect.any(String),
      targetId: "abcd1234",
    });

    const storageRes = (await realFetch(`${base}/storage/local?key=token`).then((r) =>
      r.json(),
    )) as {
      ok: boolean;
      targetId?: string;
      values?: Record<string, string>;
    };
    expect(storageRes.ok).toBe(true);
    expect(storageRes.targetId).toBe("abcd1234");
    expect(storageRes.values).toEqual({ token: "value" });
    expect(pwMocks.storageGetViaPlaywright).toHaveBeenCalledWith({
      cdpUrl: expect.any(String),
      targetId: "abcd1234",
      kind: "local",
      key: "token",
    });
  });
});
