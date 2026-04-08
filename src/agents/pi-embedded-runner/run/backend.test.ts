import { describe, expect, it } from "vitest";
import { resolveEmbeddedAgentRuntime } from "./backend.js";

describe("resolveEmbeddedAgentRuntime", () => {
  it("keeps the PI backend as the default", () => {
    expect(resolveEmbeddedAgentRuntime({})).toBe("pi");
  });

  it("accepts codex app-server aliases", () => {
    expect(resolveEmbeddedAgentRuntime({ OPENCLAW_AGENT_RUNTIME: "codex-app-server" })).toBe(
      "codex-app-server",
    );
    expect(resolveEmbeddedAgentRuntime({ OPENCLAW_AGENT_RUNTIME: "codex" })).toBe(
      "codex-app-server",
    );
    expect(resolveEmbeddedAgentRuntime({ OPENCLAW_AGENT_RUNTIME: "app-server" })).toBe(
      "codex-app-server",
    );
  });

  it("accepts auto mode", () => {
    expect(resolveEmbeddedAgentRuntime({ OPENCLAW_AGENT_RUNTIME: "auto" })).toBe("auto");
  });
});
