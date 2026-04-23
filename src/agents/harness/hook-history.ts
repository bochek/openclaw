export const MAX_AGENT_HOOK_HISTORY_MESSAGES = 200;

export function limitAgentHookHistoryMessages<T>(
  messages: readonly T[],
  limit = MAX_AGENT_HOOK_HISTORY_MESSAGES,
): T[] {
  if (limit <= 0 || messages.length === 0) {
    return [];
  }
  if (messages.length <= limit) {
    return [...messages];
  }
  return messages.slice(-limit);
}

export function buildAgentHookConversationMessages<T>(params: {
  historyMessages: readonly T[];
  currentTurnMessages?: readonly T[];
  historyLimit?: number;
}): T[] {
  return [
    ...limitAgentHookHistoryMessages(params.historyMessages, params.historyLimit),
    ...(params.currentTurnMessages ?? []),
  ];
}
