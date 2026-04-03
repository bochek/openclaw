import type { ReplyPayload } from "../auto-reply/types.js";
import { createDedupeCache, resolveGlobalDedupeCache } from "../infra/dedupe.js";
import { resolveGlobalSingleton } from "../shared/global-singleton.js";
import {
  createConversationBindingHelpers,
  dispatchGenericDiscordInteractiveHandler,
  dispatchGenericSlackInteractiveHandler,
  dispatchGenericTelegramInteractiveHandler,
  dispatchDiscordInteractiveHandler,
  dispatchSlackInteractiveHandler,
  dispatchTelegramInteractiveHandler,
  type DiscordInteractiveDispatchContext,
  type SlackInteractiveDispatchContext,
  type TelegramInteractiveDispatchContext,
} from "./interactive-dispatch-adapters.js";
import type {
  PluginActorRef,
  PluginInteractionHandlerContext,
  PluginLaneRef,
  PluginInteractionHandlerRegistration,
  PluginInteractiveDiscordHandlerContext,
  PluginInteractiveButtons,
  PluginInteractiveDiscordHandlerRegistration,
  PluginInteractiveHandlerRegistration,
  PluginInteractiveSlackHandlerContext,
  PluginInteractiveSlackHandlerRegistration,
  PluginInteractiveTelegramHandlerRegistration,
  PluginInteractiveTelegramHandlerContext,
} from "./types.js";

type RegisteredInteractionHandler = PluginInteractionHandlerRegistration & {
  pluginId: string;
  pluginName?: string;
  pluginRoot?: string;
};

type RegisteredInteractiveHandler = PluginInteractiveHandlerRegistration & {
  pluginId: string;
  pluginName?: string;
  pluginRoot?: string;
};

type InteractiveRegistrationResult = {
  ok: boolean;
  error?: string;
};

type InteractiveDispatchResult =
  | { matched: false; handled: false; duplicate: false }
  | { matched: true; handled: boolean; duplicate: boolean };

type InteractionActionDispatchResult =
  | { matched: false; handled: false }
  | { matched: true; handled: boolean };

type InteractionCommandDispatchResult =
  | { matched: false; handled: false; reply?: undefined }
  | { matched: true; handled: boolean; reply?: ReplyPayload };

type InteractiveState = {
  interactionHandlers: Map<string, RegisteredInteractionHandler>;
  interactiveHandlers: Map<string, RegisteredInteractiveHandler>;
  callbackDedupe: ReturnType<typeof createDedupeCache>;
};

const PLUGIN_INTERACTIVE_STATE_KEY = Symbol.for("openclaw.pluginInteractiveState");

const getState = () =>
  resolveGlobalSingleton<InteractiveState>(PLUGIN_INTERACTIVE_STATE_KEY, () => ({
    interactionHandlers: new Map<string, RegisteredInteractionHandler>(),
    interactiveHandlers: new Map<string, RegisteredInteractiveHandler>(),
    callbackDedupe: resolveGlobalDedupeCache(
      Symbol.for("openclaw.pluginInteractiveCallbackDedupe"),
      {
        ttlMs: 5 * 60_000,
        maxSize: 4096,
      },
    ),
  }));

const getInteractionHandlers = () => getState().interactionHandlers;
const getInteractiveHandlers = () => getState().interactiveHandlers;
const getCallbackDedupe = () => getState().callbackDedupe;

function toRegistryKey(channel: string, namespace: string): string {
  return `${channel.trim().toLowerCase()}:${namespace.trim()}`;
}

function normalizeNamespace(namespace: string): string {
  return namespace.trim();
}

function validateNamespace(namespace: string): string | null {
  if (!namespace.trim()) {
    return "Interactive handler namespace cannot be empty";
  }
  if (!/^[A-Za-z0-9._-]+$/.test(namespace.trim())) {
    return "Interactive handler namespace must contain only letters, numbers, dots, underscores, and hyphens";
  }
  return null;
}

function resolveGenericNamespaceMatch(
  data: string,
): { registration: RegisteredInteractionHandler; namespace: string; payload: string } | null {
  const interactionHandlers = getInteractionHandlers();
  const trimmedData = data.trim();
  if (!trimmedData) {
    return null;
  }

  const separatorIndex = trimmedData.indexOf(":");
  const namespace =
    separatorIndex >= 0 ? trimmedData.slice(0, separatorIndex) : normalizeNamespace(trimmedData);
  const registration = interactionHandlers.get(normalizeNamespace(namespace));
  if (!registration) {
    return null;
  }

  return {
    registration,
    namespace,
    payload: separatorIndex >= 0 ? trimmedData.slice(separatorIndex + 1) : "",
  };
}

function resolveNamespaceMatch(
  channel: string,
  data: string,
): { registration: RegisteredInteractiveHandler; namespace: string; payload: string } | null {
  const interactiveHandlers = getInteractiveHandlers();
  const trimmedData = data.trim();
  if (!trimmedData) {
    return null;
  }

  const separatorIndex = trimmedData.indexOf(":");
  const namespace =
    separatorIndex >= 0 ? trimmedData.slice(0, separatorIndex) : normalizeNamespace(trimmedData);
  const registration = interactiveHandlers.get(toRegistryKey(channel, namespace));
  if (!registration) {
    return null;
  }

  return {
    registration,
    namespace,
    payload: separatorIndex >= 0 ? trimmedData.slice(separatorIndex + 1) : "",
  };
}

export function registerPluginInteractionHandler(
  pluginId: string,
  registration: PluginInteractionHandlerRegistration,
  opts?: { pluginName?: string; pluginRoot?: string },
): InteractiveRegistrationResult {
  const interactionHandlers = getInteractionHandlers();
  const interactiveHandlers = getInteractiveHandlers();
  const namespace = normalizeNamespace(registration.namespace);
  const validationError = validateNamespace(namespace);
  if (validationError) {
    return { ok: false, error: validationError };
  }
  if (interactionHandlers.has(namespace)) {
    const existing = interactionHandlers.get(namespace)!;
    return {
      ok: false,
      error: `Interaction handler namespace "${namespace}" already registered by plugin "${existing.pluginId}"`,
    };
  }
  for (const existing of interactiveHandlers.values()) {
    if (existing.namespace === namespace) {
      return {
        ok: false,
        error: `Interaction handler namespace "${namespace}" already registered by plugin "${existing.pluginId}"`,
      };
    }
  }
  interactionHandlers.set(namespace, {
    ...registration,
    namespace,
    pluginId,
    pluginName: opts?.pluginName,
    pluginRoot: opts?.pluginRoot,
  });
  return { ok: true };
}

export function registerPluginInteractiveHandler(
  pluginId: string,
  registration: PluginInteractiveHandlerRegistration,
  opts?: { pluginName?: string; pluginRoot?: string },
): InteractiveRegistrationResult {
  const interactiveHandlers = getInteractiveHandlers();
  const interactionHandlers = getInteractionHandlers();
  const namespace = normalizeNamespace(registration.namespace);
  const validationError = validateNamespace(namespace);
  if (validationError) {
    return { ok: false, error: validationError };
  }
  const genericExisting = interactionHandlers.get(namespace);
  if (genericExisting) {
    return {
      ok: false,
      error: `Interactive handler namespace "${namespace}" already registered by plugin "${genericExisting.pluginId}"`,
    };
  }
  const key = toRegistryKey(registration.channel, namespace);
  const existing = interactiveHandlers.get(key);
  if (existing) {
    return {
      ok: false,
      error: `Interactive handler namespace "${namespace}" already registered by plugin "${existing.pluginId}"`,
    };
  }
  interactiveHandlers.set(key, {
    ...registration,
    namespace,
    pluginId,
    pluginName: opts?.pluginName,
    pluginRoot: opts?.pluginRoot,
  });
  return { ok: true };
}

export function clearPluginInteractiveHandlers(): void {
  const interactionHandlers = getInteractionHandlers();
  const interactiveHandlers = getInteractiveHandlers();
  const callbackDedupe = getCallbackDedupe();
  interactionHandlers.clear();
  interactiveHandlers.clear();
  callbackDedupe.clear();
}

export function clearPluginInteractiveHandlersForPlugin(pluginId: string): void {
  const interactionHandlers = getInteractionHandlers();
  const interactiveHandlers = getInteractiveHandlers();
  for (const [key, value] of interactionHandlers.entries()) {
    if (value.pluginId === pluginId) {
      interactionHandlers.delete(key);
    }
  }
  for (const [key, value] of interactiveHandlers.entries()) {
    if (value.pluginId === pluginId) {
      interactiveHandlers.delete(key);
    }
  }
}

function parseInteractionCommandBody(
  commandBody: string,
): { raw: string; namespace: string; payload: string; data: string } | null {
  const trimmed = commandBody.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const withoutSlash = trimmed.slice(1).trim();
  if (!withoutSlash) {
    return null;
  }
  const spaceIndex = withoutSlash.indexOf(" ");
  const namespace =
    spaceIndex >= 0
      ? normalizeNamespace(withoutSlash.slice(0, spaceIndex))
      : normalizeNamespace(withoutSlash);
  if (!namespace) {
    return null;
  }
  const payload = spaceIndex >= 0 ? withoutSlash.slice(spaceIndex + 1).trim() : "";
  return {
    raw: trimmed,
    namespace,
    payload,
    data: payload ? `${namespace}:${payload}` : namespace,
  };
}

function buildInteractionCommandReply(
  replies: Array<{ text: string; ephemeral?: boolean }>,
): ReplyPayload | undefined {
  const texts = replies.map((reply) => reply.text.trim()).filter(Boolean);
  if (texts.length === 0) {
    return undefined;
  }
  return {
    text: texts.join("\n\n"),
  };
}

export async function dispatchPluginInteractionAction(params: {
  data: string;
  channel: string;
  accountId: string;
  lane: PluginLaneRef;
  sender?: PluginActorRef;
  parentConversationId?: string;
  interactionId: string;
  action?: Partial<PluginInteractionHandlerContext["action"]>;
  auth: {
    isAuthorizedSender: boolean;
  };
  capabilities: PluginInteractionHandlerContext["capabilities"];
  respond: PluginInteractionHandlerContext["respond"];
}): Promise<InteractionActionDispatchResult> {
  const match = resolveGenericNamespaceMatch(params.data);
  if (!match) {
    return { matched: false, handled: false };
  }

  const conversationId = params.lane.to;
  const result = await match.registration.handler({
    channel: params.channel as PluginInteractionHandlerContext["channel"],
    accountId: params.accountId,
    interactionId: params.interactionId,
    conversationId,
    parentConversationId: params.parentConversationId,
    lane: params.lane,
    sender: params.sender,
    auth: params.auth,
    action: {
      raw: params.action?.raw ?? params.data,
      namespace: match.namespace,
      payload: match.payload,
      actionId: params.action?.actionId ?? (match.payload || match.namespace),
      kind: params.action?.kind ?? "unknown",
      ...(params.action?.values?.length ? { values: params.action.values } : {}),
      ...(params.action?.fields?.length ? { fields: params.action.fields } : {}),
    },
    capabilities: params.capabilities,
    respond: params.respond,
    ...createConversationBindingHelpers({
      registration: match.registration,
      senderId: params.sender?.id,
      conversation: {
        channel: params.lane.channel,
        accountId: params.accountId,
        conversationId,
        parentConversationId: params.parentConversationId,
        threadId: params.lane.threadId,
      },
    }),
  });

  return {
    matched: true,
    handled: result?.handled ?? true,
  };
}

export async function dispatchPluginInteractionCommand(params: {
  commandBody: string;
  channel: string;
  accountId: string;
  lane: PluginLaneRef;
  sender?: PluginActorRef;
  parentConversationId?: string;
  auth: {
    isAuthorizedSender: boolean;
  };
}): Promise<InteractionCommandDispatchResult> {
  const parsedCommand = parseInteractionCommandBody(params.commandBody);
  if (!parsedCommand) {
    return { matched: false, handled: false };
  }

  const replies: Array<{ text: string; ephemeral?: boolean }> = [];
  const recordReply = (text: string, ephemeral?: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    replies.push({ text: trimmed, ephemeral });
  };

  const result = await dispatchPluginInteractionAction({
    data: parsedCommand.data,
    channel: params.channel,
    accountId: params.accountId,
    lane: params.lane,
    sender: params.sender,
    parentConversationId: params.parentConversationId,
    interactionId: `command:${params.channel}:${parsedCommand.namespace}:${parsedCommand.payload || "_"}`,
    action: {
      raw: parsedCommand.raw,
      kind: "command",
      actionId: parsedCommand.payload || parsedCommand.namespace,
    },
    auth: params.auth,
    capabilities: {
      acknowledge: false,
      followUp: true,
      editText: false,
      clearInteractive: false,
      deleteMessage: false,
    },
    respond: {
      acknowledge: async () => {},
      replyText: async ({ text, ephemeral }) => {
        recordReply(text, ephemeral);
      },
      followUpText: async ({ text, ephemeral }) => {
        recordReply(text, ephemeral);
      },
      editText: async ({ text }) => {
        recordReply(text);
      },
      clearInteractive: async ({ text } = {}) => {
        if (text?.trim()) {
          recordReply(text);
        }
      },
      deleteMessage: async () => {},
    },
  });
  if (!result.matched) {
    return result;
  }
  return {
    matched: true,
    handled: result.handled,
    reply: buildInteractionCommandReply(replies),
  };
}

export async function dispatchPluginInteractiveHandler(params: {
  channel: "telegram";
  data: string;
  callbackId: string;
  ctx: TelegramInteractiveDispatchContext;
  respond: {
    reply: (params: { text: string; buttons?: PluginInteractiveButtons }) => Promise<void>;
    editMessage: (params: { text: string; buttons?: PluginInteractiveButtons }) => Promise<void>;
    editButtons: (params: { buttons: PluginInteractiveButtons }) => Promise<void>;
    clearButtons: () => Promise<void>;
    deleteMessage: () => Promise<void>;
  };
  onMatched?: () => Promise<void> | void;
}): Promise<InteractiveDispatchResult>;
export async function dispatchPluginInteractiveHandler(params: {
  channel: "discord";
  data: string;
  interactionId: string;
  ctx: DiscordInteractiveDispatchContext;
  respond: PluginInteractiveDiscordHandlerContext["respond"];
  onMatched?: () => Promise<void> | void;
}): Promise<InteractiveDispatchResult>;
export async function dispatchPluginInteractiveHandler(params: {
  channel: "slack";
  data: string;
  interactionId: string;
  ctx: SlackInteractiveDispatchContext;
  respond: PluginInteractiveSlackHandlerContext["respond"];
  onMatched?: () => Promise<void> | void;
}): Promise<InteractiveDispatchResult>;
export async function dispatchPluginInteractiveHandler(params: {
  channel: "telegram" | "discord" | "slack";
  data: string;
  callbackId?: string;
  interactionId?: string;
  ctx:
    | TelegramInteractiveDispatchContext
    | DiscordInteractiveDispatchContext
    | SlackInteractiveDispatchContext;
  respond:
    | {
        reply: (params: { text: string; buttons?: PluginInteractiveButtons }) => Promise<void>;
        editMessage: (params: {
          text: string;
          buttons?: PluginInteractiveButtons;
        }) => Promise<void>;
        editButtons: (params: { buttons: PluginInteractiveButtons }) => Promise<void>;
        clearButtons: () => Promise<void>;
        deleteMessage: () => Promise<void>;
      }
    | PluginInteractiveDiscordHandlerContext["respond"]
    | PluginInteractiveSlackHandlerContext["respond"];
  onMatched?: () => Promise<void> | void;
}): Promise<InteractiveDispatchResult> {
  const callbackDedupe = getCallbackDedupe();
  const genericMatch = resolveGenericNamespaceMatch(params.data);
  const match = genericMatch ?? resolveNamespaceMatch(params.channel, params.data);
  if (!match) {
    return { matched: false, handled: false, duplicate: false };
  }

  const dedupeKey =
    params.channel === "telegram" ? params.callbackId?.trim() : params.interactionId?.trim();
  if (dedupeKey && callbackDedupe.peek(dedupeKey)) {
    return { matched: true, handled: true, duplicate: true };
  }

  await params.onMatched?.();

  let result:
    | ReturnType<PluginInteractionHandlerRegistration["handler"]>
    | ReturnType<PluginInteractiveTelegramHandlerRegistration["handler"]>
    | ReturnType<PluginInteractiveDiscordHandlerRegistration["handler"]>
    | ReturnType<PluginInteractiveSlackHandlerRegistration["handler"]>;
  if (genericMatch && params.channel === "telegram") {
    result = dispatchGenericTelegramInteractiveHandler({
      registration: match.registration as RegisteredInteractionHandler &
        PluginInteractionHandlerRegistration,
      data: params.data,
      namespace: match.namespace,
      payload: match.payload,
      ctx: params.ctx as TelegramInteractiveDispatchContext,
      respond: params.respond as PluginInteractiveTelegramHandlerContext["respond"],
    });
  } else if (genericMatch && params.channel === "discord") {
    result = dispatchGenericDiscordInteractiveHandler({
      registration: match.registration as RegisteredInteractionHandler &
        PluginInteractionHandlerRegistration,
      data: params.data,
      namespace: match.namespace,
      payload: match.payload,
      ctx: params.ctx as DiscordInteractiveDispatchContext,
      respond: params.respond as PluginInteractiveDiscordHandlerContext["respond"],
    });
  } else if (genericMatch) {
    result = dispatchGenericSlackInteractiveHandler({
      registration: match.registration as RegisteredInteractionHandler &
        PluginInteractionHandlerRegistration,
      data: params.data,
      namespace: match.namespace,
      payload: match.payload,
      ctx: params.ctx as SlackInteractiveDispatchContext,
      respond: params.respond as PluginInteractiveSlackHandlerContext["respond"],
    });
  } else if (params.channel === "telegram") {
    result = dispatchTelegramInteractiveHandler({
      registration: match.registration as RegisteredInteractiveHandler &
        PluginInteractiveTelegramHandlerRegistration,
      data: params.data,
      namespace: match.namespace,
      payload: match.payload,
      ctx: params.ctx as TelegramInteractiveDispatchContext,
      respond: params.respond as PluginInteractiveTelegramHandlerContext["respond"],
    });
  } else if (params.channel === "discord") {
    result = dispatchDiscordInteractiveHandler({
      registration: match.registration as RegisteredInteractiveHandler &
        PluginInteractiveDiscordHandlerRegistration,
      data: params.data,
      namespace: match.namespace,
      payload: match.payload,
      ctx: params.ctx as DiscordInteractiveDispatchContext,
      respond: params.respond as PluginInteractiveDiscordHandlerContext["respond"],
    });
  } else {
    result = dispatchSlackInteractiveHandler({
      registration: match.registration as RegisteredInteractiveHandler &
        PluginInteractiveSlackHandlerRegistration,
      data: params.data,
      namespace: match.namespace,
      payload: match.payload,
      ctx: params.ctx as SlackInteractiveDispatchContext,
      respond: params.respond as PluginInteractiveSlackHandlerContext["respond"],
    });
  }
  const resolved = await result;
  if (dedupeKey) {
    callbackDedupe.check(dedupeKey);
  }

  return {
    matched: true,
    handled: resolved?.handled ?? true,
    duplicate: false,
  };
}
