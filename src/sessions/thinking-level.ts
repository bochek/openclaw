import type { ThinkLevel } from "../auto-reply/thinking.js";

export type ThinkingLevelSource =
  | "command"
  | "session"
  | "model_default"
  | "global_default"
  | "disabled";

export async function resolveThinkingLevelByPrecedence(params: {
  commandThinkLevel?: ThinkLevel | null;
  sessionThinkLevel?: ThinkLevel | null;
  resolveModelDefaultThinkingLevel?: () => Promise<ThinkLevel | undefined>;
  globalDefaultThinkLevel?: ThinkLevel | null;
  disabledThinkLevel?: ThinkLevel;
}): Promise<{ level: ThinkLevel; source: ThinkingLevelSource }> {
  if (params.commandThinkLevel) {
    return { level: params.commandThinkLevel, source: "command" };
  }
  if (params.sessionThinkLevel) {
    return { level: params.sessionThinkLevel, source: "session" };
  }
  if (params.resolveModelDefaultThinkingLevel) {
    const modelDefault = await params.resolveModelDefaultThinkingLevel();
    if (modelDefault) {
      return { level: modelDefault, source: "model_default" };
    }
  }
  if (params.globalDefaultThinkLevel) {
    return { level: params.globalDefaultThinkLevel, source: "global_default" };
  }
  return { level: params.disabledThinkLevel ?? "off", source: "disabled" };
}
