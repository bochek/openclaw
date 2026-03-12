import { describe, expect, it } from "vitest";
import type { ReplyPayload } from "../../../auto-reply/types.js";
import {
  buildSlackStreamFallbackText,
  isSlackStreamingEnabled,
  resolveSlackStreamingThreadHint,
  shouldFinalizeSlackStreamBeforePlainPayload,
} from "./dispatch.js";

describe("slack native streaming defaults", () => {
  it("is enabled for partial mode when native streaming is on", () => {
    expect(isSlackStreamingEnabled({ mode: "partial", nativeStreaming: true })).toBe(true);
  });

  it("is disabled outside partial mode or when native streaming is off", () => {
    expect(isSlackStreamingEnabled({ mode: "partial", nativeStreaming: false })).toBe(false);
    expect(isSlackStreamingEnabled({ mode: "block", nativeStreaming: true })).toBe(false);
    expect(isSlackStreamingEnabled({ mode: "progress", nativeStreaming: true })).toBe(false);
    expect(isSlackStreamingEnabled({ mode: "off", nativeStreaming: true })).toBe(false);
  });
});

describe("slack native streaming thread hint", () => {
  it("stays off-thread when replyToMode=off and message is not in a thread", () => {
    expect(
      resolveSlackStreamingThreadHint({
        replyToMode: "off",
        incomingThreadTs: undefined,
        messageTs: "1000.1",
      }),
    ).toBeUndefined();
  });

  it("uses first-reply thread when replyToMode=first", () => {
    expect(
      resolveSlackStreamingThreadHint({
        replyToMode: "first",
        incomingThreadTs: undefined,
        messageTs: "1000.2",
      }),
    ).toBe("1000.2");
  });

  it("uses the existing incoming thread regardless of replyToMode", () => {
    expect(
      resolveSlackStreamingThreadHint({
        replyToMode: "off",
        incomingThreadTs: "2000.1",
        messageTs: "1000.3",
      }),
    ).toBe("2000.1");
  });
});

describe("slack native streaming fallback helpers", () => {
  it("replays accumulated streamed text before the failing chunk", () => {
    expect(buildSlackStreamFallbackText("First chunk", "Second chunk")).toBe(
      "First chunk\nSecond chunk",
    );
    expect(buildSlackStreamFallbackText("", "Only chunk")).toBe("Only chunk");
  });

  it("finalizes an active stream before sending plain payloads", () => {
    const mediaPayload: ReplyPayload = {
      text: "Image caption",
      mediaUrl: "file:///tmp/example.png",
    };
    const emptyTextPayload: ReplyPayload = { text: "   " };
    const normalTextPayload: ReplyPayload = { text: "Continue streaming" };

    expect(
      shouldFinalizeSlackStreamBeforePlainPayload({
        hasActiveStream: true,
        payload: mediaPayload,
      }),
    ).toBe(true);
    expect(
      shouldFinalizeSlackStreamBeforePlainPayload({
        hasActiveStream: true,
        payload: emptyTextPayload,
      }),
    ).toBe(true);
    expect(
      shouldFinalizeSlackStreamBeforePlainPayload({
        hasActiveStream: true,
        payload: normalTextPayload,
      }),
    ).toBe(false);
    expect(
      shouldFinalizeSlackStreamBeforePlainPayload({
        hasActiveStream: false,
        payload: mediaPayload,
      }),
    ).toBe(false);
  });
});
