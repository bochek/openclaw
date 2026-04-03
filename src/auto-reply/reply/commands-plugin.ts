/**
 * Plugin Command Handler
 *
 * Handles commands registered by plugins, bypassing the LLM agent.
 * This handler is called before built-in command handlers.
 */

import { matchPluginCommand, executePluginCommand } from "../../plugins/commands.js";
import { dispatchPluginInteractionCommand } from "../../plugins/interactive.js";
import { createPluginActorRef, createPluginLaneRef } from "../../plugins/lane-refs.js";
import type { CommandHandler, CommandHandlerResult } from "./commands-types.js";

/**
 * Handle plugin-registered commands.
 * Returns a result if a plugin command was matched and executed,
 * or null to continue to the next handler.
 */
export const handlePluginCommand: CommandHandler = async (
  params,
  allowTextCommands,
): Promise<CommandHandlerResult | null> => {
  const { command, cfg } = params;

  if (!allowTextCommands) {
    return null;
  }

  // Try to match a plugin command
  const match = matchPluginCommand(command.commandBodyNormalized);
  if (!match) {
    const lane = createPluginLaneRef({
      channel: command.channel,
      to:
        (typeof command.to === "string" && command.to.startsWith("slash:")
          ? command.from
          : command.to) ?? command.from,
      accountId: params.ctx.AccountId ?? undefined,
      threadId:
        typeof params.ctx.MessageThreadId === "string" ||
        typeof params.ctx.MessageThreadId === "number"
          ? params.ctx.MessageThreadId
          : undefined,
    });
    if (!lane) {
      return null;
    }
    const sender = createPluginActorRef({
      channel: command.channel,
      id: command.senderId,
      accountId: params.ctx.AccountId ?? undefined,
      dmLane: command.senderId
        ? (createPluginLaneRef({
            channel: command.channel,
            to: command.senderId,
            accountId: params.ctx.AccountId ?? undefined,
          }) ?? null)
        : undefined,
    });
    const interactionResult = await dispatchPluginInteractionCommand({
      commandBody: command.commandBodyNormalized,
      channel: command.channel,
      accountId: params.ctx.AccountId ?? "default",
      lane,
      sender,
      parentConversationId: params.ctx.ThreadParentId?.trim() || undefined,
      auth: {
        isAuthorizedSender: command.isAuthorizedSender,
      },
    });
    if (!interactionResult.matched) {
      return null;
    }
    return {
      shouldContinue: false,
      reply: interactionResult.reply,
    };
  }

  // Execute the plugin command (always returns a result)
  const result = await executePluginCommand({
    command: match.command,
    args: match.args,
    senderId: command.senderId,
    channel: command.channel,
    channelId: command.channelId,
    isAuthorizedSender: command.isAuthorizedSender,
    gatewayClientScopes: params.ctx.GatewayClientScopes,
    sessionKey: params.sessionKey,
    sessionId: params.sessionEntry?.sessionId,
    commandBody: command.commandBodyNormalized,
    config: cfg,
    from: command.from,
    to: command.to,
    accountId: params.ctx.AccountId ?? undefined,
    messageThreadId:
      typeof params.ctx.MessageThreadId === "string" ||
      typeof params.ctx.MessageThreadId === "number"
        ? params.ctx.MessageThreadId
        : undefined,
    threadParentId: params.ctx.ThreadParentId?.trim() || undefined,
  });

  return {
    shouldContinue: false,
    reply: result,
  };
};
