import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VERCEL_AI_GATEWAY_BASE_URL } from "../plugin-sdk/vercel-ai-gateway.js";
import { NON_ENV_SECRETREF_MARKER } from "./model-auth-markers.js";
import { resolveImplicitProvidersForTest } from "./models-config.e2e-harness.js";

describe("vercel-ai-gateway provider resolution", () => {
  it("adds the provider with GPT-5.4 models when AI_GATEWAY_API_KEY is present", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: { AI_GATEWAY_API_KEY: "vercel-gateway-test-key" }, // pragma: allowlist secret
      onlyPluginIds: ["vercel-ai-gateway"],
    });
    const provider = providers?.["vercel-ai-gateway"];
    expect(provider?.apiKey).toBe("AI_GATEWAY_API_KEY");
    expect(provider?.api).toBe("anthropic-messages");
    expect(provider?.baseUrl).toBe(VERCEL_AI_GATEWAY_BASE_URL);
    expect(provider?.models?.some((model) => model.id === "openai/gpt-5.4")).toBe(true);
    expect(provider?.models?.some((model) => model.id === "openai/gpt-5.4-pro")).toBe(true);
  });

  it("prefers env keyRef marker over runtime plaintext for persistence", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    await writeFile(
      join(agentDir, "auth-profiles.json"),
      JSON.stringify(
        {
          version: 1,
          profiles: {
            "vercel-ai-gateway:default": {
              type: "api_key",
              provider: "vercel-ai-gateway",
              key: "sk-runtime-vercel",
              keyRef: { source: "env", provider: "default", id: "AI_GATEWAY_API_KEY" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {},
      onlyPluginIds: ["vercel-ai-gateway"],
    });
    expect(providers?.["vercel-ai-gateway"]?.apiKey).toBe("AI_GATEWAY_API_KEY");
  });

  it("uses non-env marker for non-env keyRef vercel profiles", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    await writeFile(
      join(agentDir, "auth-profiles.json"),
      JSON.stringify(
        {
          version: 1,
          profiles: {
            "vercel-ai-gateway:default": {
              type: "api_key",
              provider: "vercel-ai-gateway",
              key: "sk-runtime-vercel",
              keyRef: { source: "file", provider: "vault", id: "/vercel/ai-gateway/api-key" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const providers = await resolveImplicitProvidersForTest({
      agentDir,
      env: {},
      onlyPluginIds: ["vercel-ai-gateway"],
    });
    expect(providers?.["vercel-ai-gateway"]?.apiKey).toBe(NON_ENV_SECRETREF_MARKER);
  });
});
