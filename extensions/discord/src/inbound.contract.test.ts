import { describe, expect, it } from "vitest";
import { expectChannelInboundContextContract } from "../../../src/channels/plugins/contracts/suites.js";
import type { MsgContext } from "../../../src/auto-reply/templating.js";
import { loadBundledPluginTestApiSync } from "../../../src/test-utils/bundled-plugin-public-surface.js";

describe("discord inbound contract", () => {
  it("keeps inbound context finalized", () => {
    const { buildFinalizedDiscordDirectInboundContext } = loadBundledPluginTestApiSync<{
      buildFinalizedDiscordDirectInboundContext: () => MsgContext;
    }>("discord");
    const ctx = buildFinalizedDiscordDirectInboundContext();

    expect(ctx).toBeTruthy();
    expectChannelInboundContextContract(ctx);
  });
});
