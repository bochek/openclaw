import { describe, expect, it } from "vitest";
import type { MsgContext } from "../../../src/auto-reply/templating.js";
import { expectChannelInboundContextContract } from "../../../src/channels/plugins/contracts/suites.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import type { ResolvedSlackAccount } from "../../../src/plugin-sdk/slack.js";
import { loadBundledPluginTestApiSync } from "../../../src/test-utils/bundled-plugin-public-surface.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

type SlackMessageEvent = {
  channel: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts: string;
};

type SlackPrepareResult = { ctxPayload: MsgContext } | null | undefined;

function createSlackAccount(config: ResolvedSlackAccount["config"] = {}): ResolvedSlackAccount {
  return {
    accountId: "default",
    enabled: true,
    botTokenSource: "config",
    appTokenSource: "config",
    userTokenSource: "none",
    config,
    replyToMode: config.replyToMode,
    replyToModeByChatType: config.replyToModeByChatType,
    dm: config.dm,
  };
}

describe("slack inbound contract", () => {
  it("keeps inbound context finalized", async () => {
    const { createInboundSlackTestContext, prepareSlackMessage } = loadBundledPluginTestApiSync<{
      createInboundSlackTestContext: (params: { cfg: OpenClawConfig }) => {
        resolveUserName?: () => Promise<unknown>;
      };
      prepareSlackMessage: (params: {
        ctx: {
          resolveUserName?: () => Promise<unknown>;
        };
        account: ResolvedSlackAccount;
        message: SlackMessageEvent;
        opts: { source: string };
      }) => Promise<SlackPrepareResult>;
    }>("slack");

    await withTempHome(async () => {
      const ctx = createInboundSlackTestContext({
        cfg: {
          channels: { slack: { enabled: true } },
        } as OpenClawConfig,
      });
      ctx.resolveUserName = async () => ({ name: "Alice" }) as never;

      const prepared = await prepareSlackMessage({
        ctx,
        account: createSlackAccount(),
        message: {
          channel: "D123",
          channel_type: "im",
          user: "U1",
          text: "hi",
          ts: "1.000",
        },
        opts: { source: "message" },
      });

      expect(prepared).toBeTruthy();
      expectChannelInboundContextContract(prepared!.ctxPayload);
    });
  });
});
