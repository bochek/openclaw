import { getChatChannelMeta, type ChannelPlugin } from "openclaw/plugin-sdk/core";
import { listIrcAccountIds, resolveDefaultIrcAccountId, type ResolvedIrcAccount } from "./accounts.js";
import { ircSetupAdapter } from "./setup-core.js";
import { ircSetupWizard } from "./setup-surface.js";

export const ircSetupPlugin: ChannelPlugin<ResolvedIrcAccount> = {
  id: "irc",
  meta: {
    ...getChatChannelMeta("irc"),
    quickstartAllowFrom: true,
  },
  config: {
    listAccountIds: listIrcAccountIds,
    defaultAccountId: resolveDefaultIrcAccountId,
  },
  setup: ircSetupAdapter,
  setupWizard: ircSetupWizard,
};
