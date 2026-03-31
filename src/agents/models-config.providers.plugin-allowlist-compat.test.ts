import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveCoreImplicitProvidersForTest,
  resolveImplicitProvidersForTest,
} from "./models-config.e2e-harness.js";

describe("implicit provider plugin allowlist compatibility", () => {
  it("keeps bundled implicit providers discoverable when plugins.allow is set", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {
        KILOCODE_API_KEY: "test-kilo-key",
        MOONSHOT_API_KEY: "test-moonshot-key",
      },
      onlyPluginIds: ["kilocode", "moonshot"],
      config: {
        plugins: {
          allow: ["openrouter"],
        },
      },
    });
    expect(providers?.kilocode).toBeDefined();
    expect(providers?.moonshot).toBeDefined();
  });

  it("still honors explicit plugin denies over compat allowlist injection", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {
        KILOCODE_API_KEY: "test-kilo-key",
        MOONSHOT_API_KEY: "test-moonshot-key",
      },
      onlyPluginIds: ["kilocode", "moonshot"],
      config: {
        plugins: {
          allow: ["openrouter"],
          deny: ["kilocode"],
        },
      },
    });
    expect(providers?.kilocode).toBeUndefined();
    expect(providers?.moonshot).toBeDefined();
  });

  it("treats an explicit empty plugin scope as core-only and skips plugin discovery", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveCoreImplicitProvidersForTest({
      agentDir,
      env: {
        KILOCODE_API_KEY: "test-kilo-key",
        MOONSHOT_API_KEY: "test-moonshot-key",
      },
    });

    expect(providers?.kilocode).toBeUndefined();
    expect(providers?.moonshot).toBeUndefined();
  });
});
