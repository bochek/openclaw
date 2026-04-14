import type {
  ProviderIntermediateAssistantAck,
  ProviderIntermediateAssistantAckContext,
} from "openclaw/plugin-sdk/plugin-entry";

const INTERMEDIATE_ACK_MAX_VISIBLE_TEXT = 1_200;
const INTERMEDIATE_ACK_FUTURE_ACTION_RE =
  /\b(?:i(?:'ll| will)|let me|i can do that|i can help with that|i can take(?:\s+\w+){0,2}\s+look)\b/i;
const INTERMEDIATE_ACK_ACTION_RE =
  /\b(?:inspect|check|look(?:\s+into|\s+at)?|review|read|search|find|trace|debug|fix|patch|update|change|edit|run|test|verify|compare|investigate|explore|scan|walk through|walk me through|summari(?:s|z)e|report back)\b/i;
const INTERMEDIATE_ACK_COMPLETION_RE =
  /\b(?:done|finished|implemented|updated|fixed|changed|ran|verified|found|here(?:'s| is)|summary|blocked)\b/i;
const INTERMEDIATE_ACK_SUMMARY_DELIVERY_RE =
  /\b(?:i(?:'ll| will)|let me)\s+summari(?:s|z)e\b[^:.\n]{0,120}(?::|\.)/i;
const OPTIONAL_OFFER_RE = /^\s*if\s+(?:you\s+want|you['’]d\s+like|helpful)\b/i;
const WORKSPACE_MARKER_RE =
  /\b(?:file|files|repo|repository|code|codebase|project|workspace|directory|folder|path|tests?)\b/i;

export const OPENAI_INTERMEDIATE_ACK_RETRY_INSTRUCTION =
  "The previous assistant turn acknowledged the task without taking action. Continue now: take the first concrete tool action you can. Do not restate the intent or ask to proceed again. If a real blocker prevents action, reply with the exact blocker in one sentence.";

/**
 * Detect provider-owned assistant acknowledgements that should continue into
 * the first concrete action instead of ending the turn.
 */
export function resolveOpenAIIntermediateAssistantAck(
  ctx: ProviderIntermediateAssistantAckContext,
): ProviderIntermediateAssistantAck | undefined {
  if (ctx.hasToolMessageInTranscript) {
    return undefined;
  }
  const assistantText = ctx.assistantText.trim();
  if (
    !assistantText ||
    assistantText.length > INTERMEDIATE_ACK_MAX_VISIBLE_TEXT ||
    assistantText.includes("```") ||
    assistantText.includes("?")
  ) {
    return undefined;
  }
  if (
    OPTIONAL_OFFER_RE.test(assistantText) ||
    INTERMEDIATE_ACK_COMPLETION_RE.test(assistantText) ||
    INTERMEDIATE_ACK_SUMMARY_DELIVERY_RE.test(assistantText)
  ) {
    return undefined;
  }
  if (!INTERMEDIATE_ACK_FUTURE_ACTION_RE.test(assistantText)) {
    return undefined;
  }
  if (!INTERMEDIATE_ACK_ACTION_RE.test(assistantText)) {
    return undefined;
  }
  const promptMentionsWorkspace = WORKSPACE_MARKER_RE.test(ctx.prompt);
  const assistantMentionsWorkspace = WORKSPACE_MARKER_RE.test(assistantText);
  if (!promptMentionsWorkspace && !assistantMentionsWorkspace) {
    return undefined;
  }
  return {
    instruction: OPENAI_INTERMEDIATE_ACK_RETRY_INSTRUCTION,
  };
}
