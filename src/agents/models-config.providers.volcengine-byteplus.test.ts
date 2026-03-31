import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { upsertAuthProfile } from "./auth-profiles.js";
import { resolveImplicitProvidersForTest } from "./models-config.e2e-harness.js";

describe("Volcengine and BytePlus providers", () => {
  it("includes volcengine and volcengine-plan when VOLCANO_ENGINE_API_KEY is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: { VOLCANO_ENGINE_API_KEY: "test-key" }, // pragma: allowlist secret
      onlyPluginIds: ["volcengine"],
    });
    expect(providers?.volcengine).toBeDefined();
    expect(providers?.["volcengine-plan"]).toBeDefined();
    expect(providers?.volcengine?.apiKey).toBe("VOLCANO_ENGINE_API_KEY");
    expect(providers?.["volcengine-plan"]?.apiKey).toBe("VOLCANO_ENGINE_API_KEY");
  });

  it("includes byteplus and byteplus-plan when BYTEPLUS_API_KEY is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: { BYTEPLUS_API_KEY: "test-key" }, // pragma: allowlist secret
      onlyPluginIds: ["byteplus"],
    });
    expect(providers?.byteplus).toBeDefined();
    expect(providers?.["byteplus-plan"]).toBeDefined();
    expect(providers?.byteplus?.apiKey).toBe("BYTEPLUS_API_KEY");
    expect(providers?.["byteplus-plan"]?.apiKey).toBe("BYTEPLUS_API_KEY");
  });

  it("includes providers when auth profiles are env keyRef-only", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    upsertAuthProfile({
      profileId: "volcengine:default",
      credential: {
        type: "api_key",
        provider: "volcengine",
        keyRef: { source: "env", provider: "default", id: "VOLCANO_ENGINE_API_KEY" },
      },
      agentDir,
    });
    upsertAuthProfile({
      profileId: "byteplus:default",
      credential: {
        type: "api_key",
        provider: "byteplus",
        keyRef: { source: "env", provider: "default", id: "BYTEPLUS_API_KEY" },
      },
      agentDir,
    });

    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {},
      onlyPluginIds: ["volcengine", "byteplus"],
    });
    expect(providers?.volcengine?.apiKey).toBe("VOLCANO_ENGINE_API_KEY");
    expect(providers?.["volcengine-plan"]?.apiKey).toBe("VOLCANO_ENGINE_API_KEY");
    expect(providers?.byteplus?.apiKey).toBe("BYTEPLUS_API_KEY");
    expect(providers?.["byteplus-plan"]?.apiKey).toBe("BYTEPLUS_API_KEY");
  });
});
