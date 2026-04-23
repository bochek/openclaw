import { describe, expect, it } from "vitest";
import {
  buildAgentHookConversationMessages,
  limitAgentHookHistoryMessages,
  MAX_AGENT_HOOK_HISTORY_MESSAGES,
} from "./hook-history.js";

describe("limitAgentHookHistoryMessages", () => {
  it("keeps the newest bounded history window", () => {
    const history = Array.from(
      { length: MAX_AGENT_HOOK_HISTORY_MESSAGES + 5 },
      (_, index) => `msg-${index}`,
    );

    expect(limitAgentHookHistoryMessages(history)).toEqual(
      Array.from({ length: MAX_AGENT_HOOK_HISTORY_MESSAGES }, (_, index) => `msg-${index + 5}`),
    );
  });

  it("returns a shallow copy when history already fits", () => {
    const history = ["a", "b"];
    const bounded = limitAgentHookHistoryMessages(history);

    expect(bounded).toEqual(history);
    expect(bounded).not.toBe(history);
  });
});

describe("buildAgentHookConversationMessages", () => {
  it("preserves the current turn after trimming older history", () => {
    const history = Array.from(
      { length: MAX_AGENT_HOOK_HISTORY_MESSAGES + 3 },
      (_, index) => `history-${index}`,
    );

    expect(
      buildAgentHookConversationMessages({
        historyMessages: history,
        currentTurnMessages: ["user-now", "assistant-now"],
      }),
    ).toEqual([
      ...Array.from(
        { length: MAX_AGENT_HOOK_HISTORY_MESSAGES },
        (_, index) => `history-${index + 3}`,
      ),
      "user-now",
      "assistant-now",
    ]);
  });
});
