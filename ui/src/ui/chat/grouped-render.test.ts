/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it } from "vitest";
import type { MessageGroup } from "../types/chat-types.ts";
import { renderMessageGroup } from "./grouped-render.ts";

function renderGroup(group: MessageGroup) {
  const container = document.createElement("div");
  render(renderMessageGroup(group, { showReasoning: false }), container);
  return container;
}

describe("renderMessageGroup", () => {
  it("adds action padding when assistant bubbles render markdown actions", () => {
    const container = renderGroup({
      kind: "group",
      key: "assistant-group",
      role: "assistant",
      messages: [
        {
          key: "message-1",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Hello from the assistant" }],
          },
        },
      ],
      timestamp: Date.now(),
      isStreaming: false,
    });

    const bubble = container.querySelector(".chat-bubble");
    expect(bubble?.classList.contains("has-actions")).toBe(true);
  });

  it("does not add action padding for user bubbles", () => {
    const container = renderGroup({
      kind: "group",
      key: "user-group",
      role: "user",
      messages: [
        {
          key: "message-1",
          message: {
            role: "user",
            content: "Hello from the user",
          },
        },
      ],
      timestamp: Date.now(),
      isStreaming: false,
    });

    const bubble = container.querySelector(".chat-bubble");
    expect(bubble?.classList.contains("has-actions")).toBe(false);
  });
});
