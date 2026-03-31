// Private runtime barrel for the bundled LINE extension.
// Keep this barrel thin and aligned with the local extension surface.

export type {
  ChannelPlugin,
  OpenClawConfig,
  OpenClawPluginApi,
  PluginRuntime,
} from "openclaw/plugin-sdk/core";
export { clearAccountEntryFields } from "openclaw/plugin-sdk/core";
export { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
export type { ReplyPayload } from "openclaw/plugin-sdk/reply-runtime";
export type { ChannelAccountSnapshot, ChannelGatewayContext } from "openclaw/plugin-sdk/testing";
export type { ChannelStatusIssue } from "openclaw/plugin-sdk/channel-contract";
export type { ChannelSetupDmPolicy, ChannelSetupWizard } from "openclaw/plugin-sdk/setup";
export {
  buildComputedAccountStatusSnapshot,
  buildTokenChannelStatusSummary,
} from "openclaw/plugin-sdk/status-helpers";
export {
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  setSetupChannelEnabled,
  splitSetupEntries,
} from "openclaw/plugin-sdk/setup";
// Keep named exports explicit here so the runtime barrel stays self-contained
// and plugin-sdk can re-export this file directly without reaching into
// extension internals.
export {
  firstDefined,
  isSenderAllowed,
  normalizeAllowFrom,
  normalizeDmAllowFromWithStore,
} from "./src/bot-access.js";
export { buildTemplateMessageFromPayload } from "./src/template-messages.js";
export { createQuickReplyItems } from "./src/quick-replies.js";

type DownloadLineMedia = typeof import("./src/download.js").downloadLineMedia;
type ProbeLineBot = typeof import("./src/probe.js").probeLineBot;
type PushMessageLine = typeof import("./src/send.js").pushMessageLine;
type PushMessagesLine = typeof import("./src/send.js").pushMessagesLine;
type PushLocationMessage = typeof import("./src/send.js").pushLocationMessage;
type PushFlexMessage = typeof import("./src/send.js").pushFlexMessage;
type PushTemplateMessage = typeof import("./src/send.js").pushTemplateMessage;
type PushTextMessageWithQuickReplies = typeof import("./src/send.js").pushTextMessageWithQuickReplies;
type SendMessageLine = typeof import("./src/send.js").sendMessageLine;
type MonitorLineProvider = typeof import("./src/monitor.js").monitorLineProvider;

export const downloadLineMedia: DownloadLineMedia = async (...args) => {
  const mod = await import("./src/download.js");
  return mod.downloadLineMedia(...args);
};

export const probeLineBot: ProbeLineBot = async (...args) => {
  const mod = await import("./src/probe.js");
  return mod.probeLineBot(...args);
};

export const sendMessageLine: SendMessageLine = async (...args) => {
  const mod = await import("./src/send.js");
  return mod.sendMessageLine(...args);
};

export const pushMessageLine: PushMessageLine = async (...args) => {
  const mod = await import("./src/send.js");
  return mod.pushMessageLine(...args);
};

export const pushMessagesLine: PushMessagesLine = async (...args) => {
  const mod = await import("./src/send.js");
  return mod.pushMessagesLine(...args);
};

export const pushLocationMessage: PushLocationMessage = async (...args) => {
  const mod = await import("./src/send.js");
  return mod.pushLocationMessage(...args);
};

export const pushFlexMessage: PushFlexMessage = async (...args) => {
  const mod = await import("./src/send.js");
  return mod.pushFlexMessage(...args);
};

export const pushTemplateMessage: PushTemplateMessage = async (...args) => {
  const mod = await import("./src/send.js");
  return mod.pushTemplateMessage(...args);
};

export const pushTextMessageWithQuickReplies: PushTextMessageWithQuickReplies = async (...args) => {
  const mod = await import("./src/send.js");
  return mod.pushTextMessageWithQuickReplies(...args);
};

export const monitorLineProvider: MonitorLineProvider = async (...args) => {
  const mod = await import("./src/monitor.js");
  return mod.monitorLineProvider(...args);
};

export * from "./src/accounts.js";
export * from "./src/bot-access.js";
export * from "./src/channel-access-token.js";
export * from "./src/config-schema.js";
export * from "./src/group-keys.js";
export * from "./src/markdown-to-line.js";
export * from "./src/quick-replies.js";
export * from "./src/signature.js";
export * from "./src/template-messages.js";
export type {
  LineChannelData,
  LineConfig,
  LineProbeResult,
  ResolvedLineAccount,
} from "./src/types.js";
export * from "./src/webhook-node.js";
export * from "./src/webhook.js";
export * from "./src/webhook-utils.js";
export { datetimePickerAction, messageAction, postbackAction, uriAction } from "./src/actions.js";
export type { Action } from "./src/actions.js";
export {
  createActionCard,
  createAgendaCard,
  createAppleTvRemoteCard,
  createCarousel,
  createDeviceControlCard,
  createEventCard,
  createImageCard,
  createInfoCard,
  createListCard,
  createMediaPlayerCard,
  createNotificationBubble,
  createReceiptCard,
  toFlexMessage,
} from "./src/flex-templates.js";
export type {
  CardAction,
  FlexBox,
  FlexBubble,
  FlexButton,
  FlexCarousel,
  FlexComponent,
  FlexContainer,
  FlexImage,
  FlexText,
  ListItem,
} from "./src/flex-templates.js";
export {
  cancelDefaultRichMenu,
  createDefaultMenuConfig,
  createGridLayout,
  createRichMenu,
  createRichMenuAlias,
  deleteRichMenu,
  deleteRichMenuAlias,
  getDefaultRichMenuId,
  getRichMenu,
  getRichMenuIdOfUser,
  getRichMenuList,
  linkRichMenuToUser,
  linkRichMenuToUsers,
  setDefaultRichMenu,
  unlinkRichMenuFromUser,
  unlinkRichMenuFromUsers,
  uploadRichMenuImage,
} from "./src/rich-menu.js";
export type {
  CreateRichMenuParams,
  RichMenuArea,
  RichMenuAreaRequest,
  RichMenuRequest,
  RichMenuResponse,
  RichMenuSize,
} from "./src/rich-menu.js";
