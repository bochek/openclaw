// Private runtime barrel for the bundled IRC extension.
// Keep this barrel thin and free of reply-dispatch runtime imports.

export {
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
  getChatChannelMeta,
} from "openclaw/plugin-sdk/core";
export { resolveControlCommandGate } from "openclaw/plugin-sdk/command-auth";
export { buildBaseChannelStatusSummary } from "openclaw/plugin-sdk/status-helpers";
export { createAccountStatusSink } from "openclaw/plugin-sdk/channel-lifecycle";
export { createChannelPairingController } from "openclaw/plugin-sdk/channel-pairing";
export {
  readStoreAllowFromForDmPolicy,
  resolveEffectiveAllowFromLists,
} from "openclaw/plugin-sdk/channel-policy";
export { logInboundDrop } from "openclaw/plugin-sdk/channel-inbound";
export { deliverFormattedTextWithAttachments } from "openclaw/plugin-sdk/reply-payload";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  isDangerousNameMatchingEnabled,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "openclaw/plugin-sdk/config-runtime";
export { ircSetupAdapter, ircSetupWizard } from "openclaw/plugin-sdk/irc-surface";
export { chunkTextForOutbound } from "openclaw/plugin-sdk/text-chunking";

export type { BaseProbeResult } from "openclaw/plugin-sdk/channel-contract";
export type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
export type {
  GroupToolPolicyBySenderConfig,
  GroupToolPolicyConfig,
} from "openclaw/plugin-sdk/channel-policy";
export type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  MarkdownConfig,
} from "openclaw/plugin-sdk/config-runtime";
export type { OutboundReplyPayload } from "openclaw/plugin-sdk/reply-payload";
export type { PluginRuntime, RuntimeEnv } from "openclaw/plugin-sdk/runtime";
