import { MediaFetchError } from "openclaw/plugin-sdk/media-runtime";
import { describe, expect, it, vi } from "vitest";
import { replySpy } from "./bot.create-telegram-bot.test-harness.js";
import {
  createTelegramCallbackQueryEvent,
  createTelegramChannelPostEvent,
  createTelegramChannelFaultHarness,
  createTelegramForumMessageEvent,
  createTelegramMessageEvent,
  createTelegramReactionEvent,
} from "./channel-fault-harness.test-support.js";

describe("telegram channel fault harness", () => {
  it("dedupes duplicate message updates by update_id", async () => {
    const harness = createTelegramChannelFaultHarness();
    const event = createTelegramMessageEvent({
      messageId: 42,
      updateId: 111,
      text: "hello",
    });

    await harness.inject(event);
    await harness.inject(event);
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

    const state = harness.getStableState();
    expect(state.replyCount).toBe(1);
    expect(state.outboundCallCount).toBe(1);
  });

  it("retries a normal final reply after a retryable outbound fault", async () => {
    const harness = createTelegramChannelFaultHarness();
    harness.setOutboundFault({ kind: "rate_limit", attempts: 1 });

    await harness.inject(
      createTelegramMessageEvent({ messageId: 50, updateId: 150, text: "hello" }),
    );
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 2 });

    const state = harness.getStableState();
    expect(state.replyCount).toBe(1);
    expect(state.outboundCallCount).toBe(2);
    expect(state.fallbackCount).toBe(0);
  });

  it("routes forum topics through topic-qualified session keys", async () => {
    const harness = createTelegramChannelFaultHarness();

    await harness.inject(createTelegramForumMessageEvent({ threadId: 99, updateId: 222 }));
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

    const state = harness.getStableState();
    expect(state.sessionKeys[0]).toContain("telegram:group:-1001234567890:topic:99");
  });

  it("handles forum messages without topic metadata safely", async () => {
    const harness = createTelegramChannelFaultHarness();

    await harness.inject(createTelegramForumMessageEvent({ threadId: undefined, updateId: 333 }));
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

    const [outbound] = harness.getOutboundCalls();
    const state = harness.getStableState();
    expect(state.sessionKeys[0]).toContain("telegram:group:-1001234567890");
    expect(state.sessionKeys[0]).toContain(":topic:1");
    expect(outbound?.meta?.message_thread_id).toBeUndefined();
  });

  it("routes callback queries and captures callback acknowledgements", async () => {
    const harness = createTelegramChannelFaultHarness();

    await harness.inject(createTelegramCallbackQueryEvent({ updateId: 444 }));
    await harness.waitForIdle({ minEmittedEvents: 2, minOutboundCalls: 1 });

    const state = harness.getStableState();
    expect(state.replyCount).toBe(1);
    expect(state.callbackAnswerCount).toBe(1);
  });

  it("handles authorized DM reactions once", async () => {
    const harness = createTelegramChannelFaultHarness({
      config: {
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            dmPolicy: "open",
            reactionNotifications: "all",
          },
        },
      } as never,
    });

    await harness.inject(createTelegramReactionEvent({ updateId: 446 }));
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 0 });

    const state = harness.getStableState();
    expect(state.reactionEventCount).toBe(1);
    expect(state.reactionContextKeys[0]).toContain("telegram:reaction:add:1234:42:9");
    expect(state.reactionSessionKeys[0]).toBe("agent:main:main");
  });

  it("handles authorized group reactions once", async () => {
    const harness = createTelegramChannelFaultHarness({
      config: {
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            dmPolicy: "open",
            groupPolicy: "open",
            reactionNotifications: "all",
          },
        },
      } as never,
    });

    await harness.inject(
      createTelegramReactionEvent({
        updateId: 447,
        chatId: -1001234567890,
        chatType: "supergroup",
      }),
    );
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 0 });

    const state = harness.getStableState();
    expect(state.reactionEventCount).toBe(1);
    expect(state.reactionSessionKeys[0]).toContain("telegram:group:-1001234567890");
  });

  it("routes forum-group reactions to the general topic when thread id is unavailable", async () => {
    const harness = createTelegramChannelFaultHarness({
      config: {
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            dmPolicy: "open",
            groupPolicy: "open",
            reactionNotifications: "all",
          },
        },
      } as never,
    });

    await harness.inject(
      createTelegramReactionEvent({
        updateId: 448,
        chatId: -1001234567890,
        chatType: "supergroup",
        isForum: true,
      }),
    );
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 0 });

    const state = harness.getStableState();
    expect(state.reactionEventCount).toBe(1);
    expect(state.reactionSessionKeys[0]).toContain("telegram:group:-1001234567890");
    expect(state.reactionSessionKeys[0]).toContain(":topic:1");
  });

  it("dedupes duplicate reaction updates", async () => {
    const harness = createTelegramChannelFaultHarness({
      config: {
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            dmPolicy: "open",
            reactionNotifications: "all",
          },
        },
      } as never,
    });
    const event = createTelegramReactionEvent({ updateId: 449 });

    await harness.inject(event);
    await harness.inject(event);
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 0 });

    const state = harness.getStableState();
    expect(state.reactionEventCount).toBe(1);
  });

  it("does not fork topic sessions for non-forum thread ids", async () => {
    const harness = createTelegramChannelFaultHarness({
      config: {
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            dmPolicy: "open",
            groupPolicy: "open",
            groups: { "*": { requireMention: false } },
          },
        },
      } as never,
    });

    await harness.inject(
      createTelegramMessageEvent({
        messageId: 62,
        updateId: 262,
        text: "@openclaw_bot hello group",
        chatId: -200,
        chatType: "supergroup",
        isForum: false,
        messageThreadId: 77,
        title: "Regular Group",
      }),
    );
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

    const state = harness.getStableState();
    expect(state.sessionKeys[0]).toContain("telegram:group:-200");
    expect(state.sessionKeys[0]).not.toContain(":topic:");
  });

  it("dispatches authorized native command messages once into the expected slash session", async () => {
    const harness = createTelegramChannelFaultHarness({
      config: {
        commands: { native: true },
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            dmPolicy: "open",
            allowFrom: ["9"],
          },
        },
      } as never,
    });

    await harness.inject(
      createTelegramMessageEvent({ messageId: 63, updateId: 263, text: "/status" }),
    );
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

    const state = harness.getStableState();
    expect(state.replyCount).toBe(1);
    expect(state.sessionKeys[0]).toContain("telegram:slash:9");
  });

  it("denies unauthorized native command messages without normal reply dispatch", async () => {
    const harness = createTelegramChannelFaultHarness({
      config: {
        commands: { native: true },
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            dmPolicy: "pairing",
            allowFrom: [],
          },
        },
      } as never,
    });

    await harness.inject(
      createTelegramMessageEvent({ messageId: 64, updateId: 264, text: "/status" }),
    );
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

    const state = harness.getStableState();
    const [outbound] = harness.getOutboundCalls();
    expect(state.replyCount).toBe(0);
    expect(state.denialCount).toBe(1);
    expect(outbound?.body).toBe("You are not authorized to use this command.");
  });

  it("acknowledges callback-driven command continuation and routes once", async () => {
    const harness = createTelegramChannelFaultHarness();

    await harness.inject(
      createTelegramCallbackQueryEvent({
        updateId: 450,
        data: "cmd:status",
      }),
    );
    await harness.waitForIdle({ minEmittedEvents: 2, minOutboundCalls: 1 });

    const state = harness.getStableState();
    expect(state.callbackAnswerCount).toBe(1);
    expect(state.replyCount).toBe(1);
    expect(state.sessionKeys).toHaveLength(1);
  });

  it("acknowledges unauthorized callback queries without dispatching a normal reply", async () => {
    const harness = createTelegramChannelFaultHarness({
      config: {
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            dmPolicy: "pairing",
            allowFrom: [],
            capabilities: { inlineButtons: "allowlist" },
          },
        },
      } as never,
    });

    await harness.inject(
      createTelegramCallbackQueryEvent({ updateId: 445, userId: 77, username: "blocked" }),
    );
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 0 });

    const state = harness.getStableState();
    expect(state.callbackAnswerCount).toBe(1);
    expect(state.replyCount).toBe(0);
    expect(state.outboundCallCount).toBe(0);
  });

  it("sends pairing guidance for denied DM messages without entering normal reply dispatch", async () => {
    const harness = createTelegramChannelFaultHarness({
      config: {
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            dmPolicy: "pairing",
            allowFrom: [],
          },
        },
      } as never,
    });

    await harness.inject(
      createTelegramMessageEvent({ messageId: 60, updateId: 260, text: "hello" }),
    );
    await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

    const state = harness.getStableState();
    const [outbound] = harness.getOutboundCalls();
    expect(state.replyCount).toBe(0);
    expect(state.denialCount).toBe(1);
    expect(outbound?.body).toContain("Pairing code:");
  });

  it("sends one fallback recovery message when processing fails", async () => {
    const harness = createTelegramChannelFaultHarness({
      replyError: new Error("boom"),
    });

    await harness.inject(
      createTelegramMessageEvent({ messageId: 61, updateId: 261, text: "hello" }),
    );
    await harness.waitForIdle({ minEmittedEvents: 2, minOutboundCalls: 1 });

    const state = harness.getStableState();
    const [outbound] = harness.getOutboundCalls();
    expect(state.replyCount).toBe(1);
    expect(state.fallbackCount).toBe(1);
    expect(state.outboundCallCount).toBe(1);
    expect(outbound?.body).toBe(
      "Something went wrong while processing your request. Please try again.",
    );
  });

  it("coalesces adjacent text fragments into one logical turn after the debounce window", async () => {
    vi.useFakeTimers();
    try {
      const harness = createTelegramChannelFaultHarness({
        config: {
          channels: {
            telegram: {
              groupPolicy: "open",
              groups: {
                "-100777111222": {
                  enabled: true,
                  requireMention: false,
                },
              },
            },
          },
        } as never,
      });
      const part1 = "A".repeat(4050);
      const part2 = "B".repeat(50);

      await harness.injectSequence([
        createTelegramChannelPostEvent({
          messageId: 301,
          updateId: 1301,
          text: part1,
        }),
        createTelegramChannelPostEvent({
          messageId: 302,
          updateId: 1302,
          date: 1736380801,
          text: part2,
        }),
      ]);

      expect(harness.getStableState().replyCount).toBe(0);

      await vi.advanceTimersByTimeAsync(130);
      await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

      const state = harness.getStableState();
      expect(state.replyCount).toBe(1);
      expect(state.dispatchRawBodies[0]).toContain(part1.slice(0, 32));
      expect(state.dispatchRawBodies[0]).toContain(part2.slice(0, 32));
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces forwarded text and forwarded attachment bursts into one logical turn", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    try {
      const harness = createTelegramChannelFaultHarness();

      await harness.injectSequence([
        createTelegramMessageEvent({
          messageId: 321,
          updateId: 1321,
          text: "Look at this",
          forwardOrigin: { type: "hidden_user", date: 1736380700, sender_user_name: "A" },
        }),
        createTelegramMessageEvent({
          messageId: 322,
          updateId: 1322,
          text: "",
          photoFileId: "fwd_photo_1",
          forwardOrigin: { type: "hidden_user", date: 1736380701, sender_user_name: "A" },
        }),
      ]);

      await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

      const state = harness.getStableState();
      const payload = replySpy.mock.calls[0]?.[0] as { Body?: string } | undefined;
      expect(state.replyCount).toBe(1);
      expect(payload?.Body).toContain("Look at this");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("flushes media groups once with combined media", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    try {
      const harness = createTelegramChannelFaultHarness({
        config: {
          channels: {
            telegram: {
              groupPolicy: "open",
              groups: {
                "-100777111222": {
                  enabled: true,
                  requireMention: false,
                },
              },
            },
          },
        } as never,
      });

      await harness.injectSequence([
        createTelegramChannelPostEvent({
          messageId: 401,
          updateId: 1401,
          caption: "album caption",
          mediaGroupId: "album-1",
          photoFileId: "p1",
        }),
        createTelegramChannelPostEvent({
          messageId: 402,
          updateId: 1402,
          date: 1736380801,
          mediaGroupId: "album-1",
          photoFileId: "p2",
        }),
      ]);

      expect(harness.getStableState().replyCount).toBe(0);

      const flushTimerCallIndex = setTimeoutSpy.mock.calls.findLastIndex((call) => call[1] === 20);
      const flushTimer =
        flushTimerCallIndex >= 0
          ? (setTimeoutSpy.mock.calls[flushTimerCallIndex]?.[0] as (() => unknown) | undefined)
          : undefined;
      if (flushTimerCallIndex >= 0) {
        clearTimeout(
          setTimeoutSpy.mock.results[flushTimerCallIndex]?.value as ReturnType<typeof setTimeout>,
        );
      }
      expect(flushTimer).toBeTypeOf("function");
      await flushTimer?.();
      await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

      const state = harness.getStableState();
      const payload = replySpy.mock.calls[0]?.[0] as { Body?: string } | undefined;
      expect(state.replyCount).toBe(1);
      expect(payload?.Body).toContain("album caption");
    } finally {
      setTimeoutSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it("keeps processing remaining media-group items after one recoverable media failure", async () => {
    let fetchCallIndex = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCallIndex += 1;
      if (fetchCallIndex === 2) {
        throw new MediaFetchError("fetch_failed", "Failed to fetch media");
      }
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    try {
      const harness = createTelegramChannelFaultHarness({
        config: {
          channels: {
            telegram: {
              groupPolicy: "open",
              groups: {
                "-100777111222": {
                  enabled: true,
                  requireMention: false,
                },
              },
            },
          },
        } as never,
      });

      await harness.injectSequence([
        createTelegramChannelPostEvent({
          messageId: 411,
          updateId: 1411,
          caption: "partial album",
          mediaGroupId: "partial-album-1",
          photoFileId: "p1",
        }),
        createTelegramChannelPostEvent({
          messageId: 412,
          updateId: 1412,
          date: 1736380801,
          mediaGroupId: "partial-album-1",
          photoFileId: "p2",
        }),
      ]);

      const flushTimerCallIndex = setTimeoutSpy.mock.calls.findLastIndex((call) => call[1] === 20);
      const flushTimer =
        flushTimerCallIndex >= 0
          ? (setTimeoutSpy.mock.calls[flushTimerCallIndex]?.[0] as (() => unknown) | undefined)
          : undefined;
      if (flushTimerCallIndex >= 0) {
        clearTimeout(
          setTimeoutSpy.mock.results[flushTimerCallIndex]?.value as ReturnType<typeof setTimeout>,
        );
      }
      expect(flushTimer).toBeTypeOf("function");
      await flushTimer?.();
      await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

      const state = harness.getStableState();
      const payload = replySpy.mock.calls[0]?.[0] as { Body?: string } | undefined;
      expect(state.replyCount).toBe(1);
      expect(payload?.Body).toContain("partial album");
    } finally {
      setTimeoutSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it("drops a media group cleanly on a non-recoverable media failure", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    try {
      const harness = createTelegramChannelFaultHarness({
        config: {
          channels: {
            telegram: {
              groupPolicy: "open",
              groups: {
                "-100777111222": {
                  enabled: true,
                  requireMention: false,
                },
              },
            },
          },
        } as never,
      });

      await harness.injectSequence([
        createTelegramChannelPostEvent({
          messageId: 421,
          updateId: 1421,
          caption: "fatal album",
          mediaGroupId: "fatal-album-1",
          photoFileId: "p1",
        }),
        {
          kind: "channel_post",
          ctx: {
            update: { update_id: 1422 },
            channelPost: {
              chat: { id: -100777111222, type: "channel", title: "Wake Channel" },
              message_id: 422,
              date: 1736380801,
              media_group_id: "fatal-album-1",
              photo: [{ file_id: "p2" }],
            },
            me: { username: "openclaw_bot" },
            getFile: async () => ({}),
          },
        },
      ]);

      const flushTimerCallIndex = setTimeoutSpy.mock.calls.findLastIndex((call) => call[1] === 20);
      const flushTimer =
        flushTimerCallIndex >= 0
          ? (setTimeoutSpy.mock.calls[flushTimerCallIndex]?.[0] as (() => unknown) | undefined)
          : undefined;
      if (flushTimerCallIndex >= 0) {
        clearTimeout(
          setTimeoutSpy.mock.results[flushTimerCallIndex]?.value as ReturnType<typeof setTimeout>,
        );
      }
      expect(flushTimer).toBeTypeOf("function");
      await flushTimer?.();

      const state = harness.getStableState();
      expect(state.replyCount).toBe(0);
      expect(state.outboundCallCount).toBe(0);
    } finally {
      setTimeoutSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it("keeps duplicate suppression across mixed sequence-heavy updates", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    try {
      const harness = createTelegramChannelFaultHarness({
        config: {
          channels: {
            telegram: {
              groupPolicy: "open",
              groups: {
                "-100777111222": {
                  enabled: true,
                  requireMention: false,
                },
              },
            },
          },
        } as never,
      });
      const duplicateText = createTelegramChannelPostEvent({
        messageId: 431,
        updateId: 1431,
        text: "C".repeat(4050),
      });

      await harness.injectSequence([
        duplicateText,
        duplicateText,
        createTelegramChannelPostEvent({
          messageId: 432,
          updateId: 1432,
          date: 1736380801,
          text: "tail",
        }),
      ]);

      await vi.advanceTimersByTimeAsync(130);
      await harness.waitForIdle({ minEmittedEvents: 1, minOutboundCalls: 1 });

      const state = harness.getStableState();
      expect(state.replyCount).toBe(1);
      expect(state.dispatchRawBodies[0]).toContain("tail");
    } finally {
      fetchSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
