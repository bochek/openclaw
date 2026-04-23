/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it } from "vitest";
import { renderChat, type ChatProps } from "./chat.ts";

const noop = () => undefined;

function createChatProps(overrides: Partial<ChatProps> = {}): ChatProps {
  return {
    sessionKey: "session-1",
    onSessionKeyChange: noop,
    thinkingLevel: null,
    showThinking: true,
    showToolCalls: true,
    loading: false,
    sending: false,
    messages: [],
    toolMessages: [],
    streamSegments: [],
    stream: null,
    streamStartedAt: null,
    assistantAvatarUrl: null,
    draft: "",
    queue: [],
    connected: true,
    canSend: true,
    disabledReason: null,
    error: null,
    sessions: null,
    focusMode: false,
    assistantName: "Val",
    assistantAvatar: null,
    onRefresh: noop,
    onToggleFocusMode: noop,
    onDraftChange: noop,
    onSend: noop,
    onQueueRemove: noop,
    onNewSession: noop,
    agentsList: null,
    currentAgentId: "default",
    onAgentChange: noop,
    ...overrides,
  };
}

describe("renderChat", () => {
  it("renders configured assistant text avatars in transcript groups", () => {
    const container = document.createElement("div");

    render(
      renderChat(
        createChatProps({
          assistantAvatar: "VC",
          messages: [{ role: "assistant", content: "hello", timestamp: 1000 }],
        }),
      ),
      container,
    );

    const avatar = container.querySelector<HTMLElement>(".chat-group.assistant .chat-avatar");
    expect(avatar).not.toBeNull();
    expect(avatar?.tagName).toBe("DIV");
    expect(avatar?.textContent).toContain("VC");
    expect(avatar?.getAttribute("aria-label")).toBe("Val");
  });
});
