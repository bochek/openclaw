import { describe, expect, it } from "vitest";
import { type OpenClawPluginApi, resolveGatewayPort } from "./api.js";

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...overrides };
}

describe("device-pair api", () => {
  it("forwards Compose-style env parsing through the plugin sdk seam", () => {
    const cfg = { gateway: { port: 19002 } } as OpenClawPluginApi["config"];

    expect(resolveGatewayPort(cfg, envWith({ OPENCLAW_GATEWAY_PORT: "127.0.0.1:18789" }))).toBe(
      18789,
    );
    expect(resolveGatewayPort(cfg, envWith({ OPENCLAW_GATEWAY_PORT: "[::1]:28789" }))).toBe(28789);
  });

  it("keeps ignoring the legacy env name at the plugin seam", () => {
    const cfg = { gateway: { port: 19002 } } as OpenClawPluginApi["config"];

    expect(resolveGatewayPort(cfg, envWith({ CLAWDBOT_GATEWAY_PORT: "127.0.0.1:18789" }))).toBe(
      19002,
    );
  });
});
