import type { ChannelGatewayContext } from "openclaw/plugin-sdk/channel-contract";
import { createAccountStatusSink } from "openclaw/plugin-sdk/channel-lifecycle";
import { runStoppablePassiveMonitor } from "openclaw/plugin-sdk/extension-shared";
import type { ResolvedIrcAccount } from "./accounts.js";
import { monitorIrcProvider } from "./monitor.js";
import type { CoreConfig } from "./types.js";

export async function startIrcGatewayAccount(
  ctx: ChannelGatewayContext<ResolvedIrcAccount>,
): Promise<void> {
  const account = ctx.account;
  const statusSink = createAccountStatusSink({
    accountId: ctx.accountId,
    setStatus: ctx.setStatus,
  });
  if (!account.configured) {
    throw new Error(
      `IRC is not configured for account "${account.accountId}" (need host and nick in channels.irc).`,
    );
  }
  ctx.log?.info(
    `[${account.accountId}] starting IRC provider (${account.host}:${account.port}${account.tls ? " tls" : ""})`,
  );
  await runStoppablePassiveMonitor({
    abortSignal: ctx.abortSignal,
    start: async () =>
      await monitorIrcProvider({
        accountId: account.accountId,
        config: ctx.cfg as CoreConfig,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink,
      }),
  });
}
