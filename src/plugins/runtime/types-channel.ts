/**
 * Runtime helpers for native channel plugins.
 *
 * This surface exposes core and channel-specific helpers used by bundled
 * plugins. Prefer hooks unless you need tight in-process coupling with the
 * OpenClaw messaging/runtime stack.
 */
type ReadChannelAllowFromStore =
  typeof import("../../pairing/pairing-store.js").readChannelAllowFromStore;
type UpsertChannelPairingRequest =
  typeof import("../../pairing/pairing-store.js").upsertChannelPairingRequest;

type ReadChannelAllowFromStoreForAccount = (params: {
  channel: Parameters<ReadChannelAllowFromStore>[0];
  accountId: string;
  env?: Parameters<ReadChannelAllowFromStore>[1];
}) => ReturnType<ReadChannelAllowFromStore>;

type UpsertChannelPairingRequestForAccount = (
  params: Omit<Parameters<UpsertChannelPairingRequest>[0], "accountId"> & { accountId: string },
) => ReturnType<UpsertChannelPairingRequest>;

export type PluginRuntimeChannel = {
  text: {
    chunkByNewline: typeof import("../../auto-reply/chunk.js").chunkByNewline;
    chunkMarkdownText: typeof import("../../auto-reply/chunk.js").chunkMarkdownText;
    chunkMarkdownTextWithMode: typeof import("../../auto-reply/chunk.js").chunkMarkdownTextWithMode;
    chunkText: typeof import("../../auto-reply/chunk.js").chunkText;
    chunkTextWithMode: typeof import("../../auto-reply/chunk.js").chunkTextWithMode;
    resolveChunkMode: typeof import("../../auto-reply/chunk.js").resolveChunkMode;
    resolveTextChunkLimit: typeof import("../../auto-reply/chunk.js").resolveTextChunkLimit;
    hasControlCommand: typeof import("../../auto-reply/command-detection.js").hasControlCommand;
    resolveMarkdownTableMode: typeof import("../../config/markdown-tables.js").resolveMarkdownTableMode;
    convertMarkdownTables: typeof import("../../markdown/tables.js").convertMarkdownTables;
  };
  reply: {
    dispatchReplyWithBufferedBlockDispatcher: typeof import("../../auto-reply/reply/provider-dispatcher.js").dispatchReplyWithBufferedBlockDispatcher;
    createReplyDispatcherWithTyping: typeof import("../../auto-reply/reply/reply-dispatcher.js").createReplyDispatcherWithTyping;
    resolveEffectiveMessagesConfig: typeof import("../../agents/identity.js").resolveEffectiveMessagesConfig;
    resolveHumanDelayConfig: typeof import("../../agents/identity.js").resolveHumanDelayConfig;
    dispatchReplyFromConfig: typeof import("../../auto-reply/reply/dispatch-from-config.js").dispatchReplyFromConfig;
    withReplyDispatcher: typeof import("../../auto-reply/dispatch.js").withReplyDispatcher;
    finalizeInboundContext: typeof import("../../auto-reply/reply/inbound-context.js").finalizeInboundContext;
    formatAgentEnvelope: typeof import("../../auto-reply/envelope.js").formatAgentEnvelope;
    /** @deprecated Prefer `BodyForAgent` + structured user-context blocks (do not build plaintext envelopes for prompts). */
    formatInboundEnvelope: typeof import("../../auto-reply/envelope.js").formatInboundEnvelope;
    resolveEnvelopeFormatOptions: typeof import("../../auto-reply/envelope.js").resolveEnvelopeFormatOptions;
  };
  routing: {
    buildAgentSessionKey: typeof import("../../routing/resolve-route.js").buildAgentSessionKey;
    resolveAgentRoute: typeof import("../../routing/resolve-route.js").resolveAgentRoute;
  };
  pairing: {
    buildPairingReply: typeof import("../../pairing/pairing-messages.js").buildPairingReply;
    readAllowFromStore: ReadChannelAllowFromStoreForAccount;
    upsertPairingRequest: UpsertChannelPairingRequestForAccount;
  };
  media: {
    fetchRemoteMedia: typeof import("../../media/fetch.js").fetchRemoteMedia;
    saveMediaBuffer: typeof import("../../media/store.js").saveMediaBuffer;
  };
  activity: {
    record: typeof import("../../infra/channel-activity.js").recordChannelActivity;
    get: typeof import("../../infra/channel-activity.js").getChannelActivity;
  };
  session: {
    resolveStorePath: typeof import("../../config/sessions.js").resolveStorePath;
    readSessionUpdatedAt: typeof import("../../config/sessions.js").readSessionUpdatedAt;
    recordSessionMetaFromInbound: typeof import("../../config/sessions.js").recordSessionMetaFromInbound;
    recordInboundSession: typeof import("../../channels/session.js").recordInboundSession;
    updateLastRoute: typeof import("../../config/sessions.js").updateLastRoute;
  };
  mentions: {
    buildMentionRegexes: typeof import("../../auto-reply/reply/mentions.js").buildMentionRegexes;
    matchesMentionPatterns: typeof import("../../auto-reply/reply/mentions.js").matchesMentionPatterns;
    matchesMentionWithExplicit: typeof import("../../auto-reply/reply/mentions.js").matchesMentionWithExplicit;
  };
  reactions: {
    shouldAckReaction: typeof import("../../channels/ack-reactions.js").shouldAckReaction;
    removeAckReactionAfterReply: typeof import("../../channels/ack-reactions.js").removeAckReactionAfterReply;
  };
  groups: {
    resolveGroupPolicy: typeof import("../../config/group-policy.js").resolveChannelGroupPolicy;
    resolveRequireMention: typeof import("../../config/group-policy.js").resolveChannelGroupRequireMention;
  };
  debounce: {
    createInboundDebouncer: typeof import("../../auto-reply/inbound-debounce.js").createInboundDebouncer;
    resolveInboundDebounceMs: typeof import("../../auto-reply/inbound-debounce.js").resolveInboundDebounceMs;
  };
  commands: {
    resolveCommandAuthorizedFromAuthorizers: typeof import("../../channels/command-gating.js").resolveCommandAuthorizedFromAuthorizers;
    isControlCommandMessage: typeof import("../../auto-reply/command-detection.js").isControlCommandMessage;
    shouldComputeCommandAuthorized: typeof import("../../auto-reply/command-detection.js").shouldComputeCommandAuthorized;
    shouldHandleTextCommands: typeof import("../../auto-reply/commands-registry.js").shouldHandleTextCommands;
  };
  discord: {
    messageActions: typeof import("openclaw/plugin-sdk/discord").discordMessageActions;
    auditChannelPermissions: typeof import("openclaw/plugin-sdk/discord").auditDiscordChannelPermissions;
    listDirectoryGroupsLive: typeof import("openclaw/plugin-sdk/discord").listDiscordDirectoryGroupsLive;
    listDirectoryPeersLive: typeof import("openclaw/plugin-sdk/discord").listDiscordDirectoryPeersLive;
    probeDiscord: typeof import("openclaw/plugin-sdk/discord").probeDiscord;
    resolveChannelAllowlist: typeof import("openclaw/plugin-sdk/discord").resolveDiscordChannelAllowlist;
    resolveUserAllowlist: typeof import("openclaw/plugin-sdk/discord").resolveDiscordUserAllowlist;
    sendComponentMessage: typeof import("openclaw/plugin-sdk/discord").sendDiscordComponentMessage;
    sendMessageDiscord: typeof import("openclaw/plugin-sdk/discord").sendMessageDiscord;
    sendPollDiscord: typeof import("openclaw/plugin-sdk/discord").sendPollDiscord;
    monitorDiscordProvider: typeof import("openclaw/plugin-sdk/discord").monitorDiscordProvider;
    threadBindings: {
      getManager: typeof import("openclaw/plugin-sdk/discord").getThreadBindingManager;
      resolveIdleTimeoutMs: typeof import("openclaw/plugin-sdk/discord").resolveThreadBindingIdleTimeoutMs;
      resolveInactivityExpiresAt: typeof import("openclaw/plugin-sdk/discord").resolveThreadBindingInactivityExpiresAt;
      resolveMaxAgeMs: typeof import("openclaw/plugin-sdk/discord").resolveThreadBindingMaxAgeMs;
      resolveMaxAgeExpiresAt: typeof import("openclaw/plugin-sdk/discord").resolveThreadBindingMaxAgeExpiresAt;
      setIdleTimeoutBySessionKey: typeof import("openclaw/plugin-sdk/discord").setThreadBindingIdleTimeoutBySessionKey;
      setMaxAgeBySessionKey: typeof import("openclaw/plugin-sdk/discord").setThreadBindingMaxAgeBySessionKey;
      unbindBySessionKey: typeof import("openclaw/plugin-sdk/discord").unbindThreadBindingsBySessionKey;
    };
    typing: {
      pulse: typeof import("openclaw/plugin-sdk/discord").sendTypingDiscord;
      start: (params: {
        channelId: string;
        accountId?: string;
        cfg?: ReturnType<typeof import("../../config/config.js").loadConfig>;
        intervalMs?: number;
      }) => Promise<{
        refresh: () => Promise<void>;
        stop: () => void;
      }>;
    };
    conversationActions: {
      editMessage: typeof import("openclaw/plugin-sdk/discord").editMessageDiscord;
      deleteMessage: typeof import("openclaw/plugin-sdk/discord").deleteMessageDiscord;
      pinMessage: typeof import("openclaw/plugin-sdk/discord").pinMessageDiscord;
      unpinMessage: typeof import("openclaw/plugin-sdk/discord").unpinMessageDiscord;
      createThread: typeof import("openclaw/plugin-sdk/discord").createThreadDiscord;
      editChannel: typeof import("openclaw/plugin-sdk/discord").editChannelDiscord;
    };
  };
  slack: {
    listDirectoryGroupsLive: typeof import("openclaw/plugin-sdk/slack").listSlackDirectoryGroupsLive;
    listDirectoryPeersLive: typeof import("openclaw/plugin-sdk/slack").listSlackDirectoryPeersLive;
    probeSlack: typeof import("openclaw/plugin-sdk/slack").probeSlack;
    resolveChannelAllowlist: typeof import("openclaw/plugin-sdk/slack").resolveSlackChannelAllowlist;
    resolveUserAllowlist: typeof import("openclaw/plugin-sdk/slack").resolveSlackUserAllowlist;
    sendMessageSlack: typeof import("openclaw/plugin-sdk/slack").sendMessageSlack;
    monitorSlackProvider: typeof import("openclaw/plugin-sdk/slack").monitorSlackProvider;
    handleSlackAction: typeof import("openclaw/plugin-sdk/slack").handleSlackAction;
  };
  telegram: {
    auditGroupMembership: typeof import("openclaw/plugin-sdk/telegram").auditTelegramGroupMembership;
    collectUnmentionedGroupIds: typeof import("openclaw/plugin-sdk/telegram").collectTelegramUnmentionedGroupIds;
    probeTelegram: typeof import("openclaw/plugin-sdk/telegram").probeTelegram;
    resolveTelegramToken: typeof import("openclaw/plugin-sdk/telegram").resolveTelegramToken;
    sendMessageTelegram: typeof import("openclaw/plugin-sdk/telegram").sendMessageTelegram;
    sendPollTelegram: typeof import("openclaw/plugin-sdk/telegram").sendPollTelegram;
    monitorTelegramProvider: typeof import("openclaw/plugin-sdk/telegram").monitorTelegramProvider;
    messageActions: typeof import("openclaw/plugin-sdk/telegram").telegramMessageActions;
    threadBindings: {
      setIdleTimeoutBySessionKey: typeof import("openclaw/plugin-sdk/telegram").setTelegramThreadBindingIdleTimeoutBySessionKey;
      setMaxAgeBySessionKey: typeof import("openclaw/plugin-sdk/telegram").setTelegramThreadBindingMaxAgeBySessionKey;
    };
    typing: {
      pulse: typeof import("openclaw/plugin-sdk/telegram").sendTypingTelegram;
      start: (params: {
        to: string;
        accountId?: string;
        cfg?: ReturnType<typeof import("../../config/config.js").loadConfig>;
        intervalMs?: number;
        messageThreadId?: number;
      }) => Promise<{
        refresh: () => Promise<void>;
        stop: () => void;
      }>;
    };
    conversationActions: {
      editMessage: typeof import("openclaw/plugin-sdk/telegram").editMessageTelegram;
      editReplyMarkup: typeof import("openclaw/plugin-sdk/telegram").editMessageReplyMarkupTelegram;
      clearReplyMarkup: (
        chatIdInput: string | number,
        messageIdInput: string | number,
        opts?: {
          token?: string;
          accountId?: string;
          verbose?: boolean;
          api?: Partial<import("grammy").Bot["api"]>;
          retry?: import("../../infra/retry.js").RetryConfig;
          cfg?: ReturnType<typeof import("../../config/config.js").loadConfig>;
        },
      ) => Promise<{ ok: true; messageId: string; chatId: string }>;
      deleteMessage: typeof import("openclaw/plugin-sdk/telegram").deleteMessageTelegram;
      renameTopic: typeof import("openclaw/plugin-sdk/telegram").renameForumTopicTelegram;
      pinMessage: typeof import("openclaw/plugin-sdk/telegram").pinMessageTelegram;
      unpinMessage: typeof import("openclaw/plugin-sdk/telegram").unpinMessageTelegram;
    };
  };
  signal: {
    probeSignal: typeof import("../../../extensions/signal/runtime-api.js").probeSignal;
    sendMessageSignal: typeof import("../../../extensions/signal/runtime-api.js").sendMessageSignal;
    monitorSignalProvider: typeof import("../../../extensions/signal/runtime-api.js").monitorSignalProvider;
    messageActions: typeof import("../../../extensions/signal/runtime-api.js").signalMessageActions;
  };
  imessage: {
    monitorIMessageProvider: typeof import("../../../extensions/imessage/runtime-api.js").monitorIMessageProvider;
    probeIMessage: typeof import("../../../extensions/imessage/runtime-api.js").probeIMessage;
    sendMessageIMessage: typeof import("../../../extensions/imessage/runtime-api.js").sendMessageIMessage;
  };
  whatsapp: {
    getActiveWebListener: typeof import("openclaw/plugin-sdk/whatsapp").getActiveWebListener;
    getWebAuthAgeMs: typeof import("openclaw/plugin-sdk/whatsapp").getWebAuthAgeMs;
    logoutWeb: typeof import("openclaw/plugin-sdk/whatsapp").logoutWeb;
    logWebSelfId: typeof import("openclaw/plugin-sdk/whatsapp").logWebSelfId;
    readWebSelfId: typeof import("openclaw/plugin-sdk/whatsapp").readWebSelfId;
    webAuthExists: typeof import("openclaw/plugin-sdk/whatsapp").webAuthExists;
    sendMessageWhatsApp: typeof import("openclaw/plugin-sdk/whatsapp").sendMessageWhatsApp;
    sendPollWhatsApp: typeof import("openclaw/plugin-sdk/whatsapp").sendPollWhatsApp;
    loginWeb: typeof import("openclaw/plugin-sdk/whatsapp").loginWeb;
    startWebLoginWithQr: typeof import("openclaw/plugin-sdk/whatsapp-login-qr").startWebLoginWithQr;
    waitForWebLogin: typeof import("openclaw/plugin-sdk/whatsapp-login-qr").waitForWebLogin;
    monitorWebChannel: typeof import("../../channels/web/index.js").monitorWebChannel;
    handleWhatsAppAction: typeof import("openclaw/plugin-sdk/whatsapp-action-runtime").handleWhatsAppAction;
    createLoginTool: typeof import("./runtime-whatsapp-login-tool.js").createRuntimeWhatsAppLoginTool;
  };
  line: {
    listLineAccountIds: typeof import("../../line/accounts.js").listLineAccountIds;
    resolveDefaultLineAccountId: typeof import("../../line/accounts.js").resolveDefaultLineAccountId;
    resolveLineAccount: typeof import("../../line/accounts.js").resolveLineAccount;
    normalizeAccountId: typeof import("../../line/accounts.js").normalizeAccountId;
    probeLineBot: typeof import("../../line/probe.js").probeLineBot;
    sendMessageLine: typeof import("../../line/send.js").sendMessageLine;
    pushMessageLine: typeof import("../../line/send.js").pushMessageLine;
    pushMessagesLine: typeof import("../../line/send.js").pushMessagesLine;
    pushFlexMessage: typeof import("../../line/send.js").pushFlexMessage;
    pushTemplateMessage: typeof import("../../line/send.js").pushTemplateMessage;
    pushLocationMessage: typeof import("../../line/send.js").pushLocationMessage;
    pushTextMessageWithQuickReplies: typeof import("../../line/send.js").pushTextMessageWithQuickReplies;
    createQuickReplyItems: typeof import("../../line/send.js").createQuickReplyItems;
    buildTemplateMessageFromPayload: typeof import("../../line/template-messages.js").buildTemplateMessageFromPayload;
    monitorLineProvider: typeof import("../../line/monitor.js").monitorLineProvider;
  };
};
