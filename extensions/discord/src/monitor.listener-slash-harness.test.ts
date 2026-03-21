import { ChannelType } from "discord-api-types/v10";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDiscordInteraction,
  createDiscordListenerEvent,
  createDiscordListenerHarness,
  createDiscordSlashHarness,
  createFinalTextPayload,
  getEnsureConfiguredBindingRouteReadyMock,
} from "./monitor.listener-slash-harness.test-support.js";

function createDeferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("discord listener/slash harness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnsureConfiguredBindingRouteReadyMock().mockReset();
    getEnsureConfiguredBindingRouteReadyMock().mockResolvedValue({ ok: true });
  });

  it("admits near-concurrent listener events without blocking the caller", async () => {
    const first = createDeferred();
    const second = createDeferred();
    let callIndex = 0;
    const harness = createDiscordListenerHarness({
      handler: vi.fn(async () => {
        callIndex += 1;
        if (callIndex === 1) {
          await first.promise;
          return;
        }
        await second.promise;
      }),
    });

    await expect(
      Promise.all([
        harness.listener.handle(
          createDiscordListenerEvent({ messageId: "m-1" }) as never,
          {} as never,
        ),
        harness.listener.handle(
          createDiscordListenerEvent({ messageId: "m-2" }) as never,
          {} as never,
        ),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    await vi.waitFor(() => {
      expect(harness.handler).toHaveBeenCalledTimes(2);
    });

    const state = harness.getStableState();
    expect(state.listenerAdmissions).toBe(2);
    expect(state.handlerCalls).toBe(2);

    first.resolve();
    second.resolve();
    await Promise.all([first.promise, second.promise]);
  });

  it("routes slash interactions into the expected DM slash and target sessions", async () => {
    const harness = await createDiscordSlashHarness({
      dispatchImplementation: async (call) => {
        await call.dispatcherOptions.deliver?.(createFinalTextPayload("ready"), {
          kind: "final",
        } as never);
        return {
          counts: {
            final: 1,
            block: 0,
            tool: 0,
          },
        } as never;
      },
    });

    await harness.run();

    const state = harness.getStableState();
    expect(state.dispatchCount).toBe(1);
    expect(state.sessionKey).toBe("agent:main:discord:slash:owner");
    expect(state.commandTargetSessionKey).toBe("agent:main:main");
    expect(state.interactionReplyCount).toBe(1);
    expect(state.interactionFollowUpCount).toBe(0);
  });

  it("acknowledges exactly once and uses followUp for subsequent slash replies", async () => {
    const harness = await createDiscordSlashHarness({
      dispatchImplementation: async (call) => {
        await call.dispatcherOptions.deliver?.(createFinalTextPayload("first"), {
          kind: "final",
        } as never);
        await call.dispatcherOptions.deliver?.(createFinalTextPayload("second"), {
          kind: "final",
        } as never);
        return {
          counts: {
            final: 2,
            block: 0,
            tool: 0,
          },
        } as never;
      },
    });

    await harness.run();

    const state = harness.getStableState();
    expect(state.interactionReplyCount).toBe(1);
    expect(state.interactionFollowUpCount).toBe(1);
  });

  it("falls back to routed slash and channel sessions when no bound session exists", async () => {
    const guildId = "1459246755253325866";
    const channelId = "1478836151241412759";
    const harness = await createDiscordSlashHarness({
      cfg: {
        commands: {
          useAccessGroups: false,
        },
        bindings: [
          {
            agentId: "qwen",
            match: {
              channel: "discord",
              accountId: "default",
              peer: { kind: "channel", id: channelId },
              guildId,
            },
          },
        ],
        channels: {
          discord: {
            guilds: {
              [guildId]: {
                channels: {
                  [channelId]: { allow: true, requireMention: false },
                },
              },
            },
          },
        },
      } as never,
      interaction: createDiscordInteraction({
        channelType: ChannelType.GuildText,
        channelId,
        guildId,
        guildName: "Ops",
      }),
      dispatchImplementation: async (call) => {
        await call.dispatcherOptions.deliver?.(createFinalTextPayload("bound"), {
          kind: "final",
        } as never);
        return {
          counts: {
            final: 1,
            block: 0,
            tool: 0,
          },
        } as never;
      },
    });

    await harness.run();

    const state = harness.getStableState();
    expect(state.sessionKey).toBe("agent:qwen:discord:slash:owner");
    expect(state.commandTargetSessionKey).toBe("agent:qwen:discord:channel:1478836151241412759");
    expect(getEnsureConfiguredBindingRouteReadyMock()).not.toHaveBeenCalled();
  });

  it("swallows expired interactions without falling back into extra replies", async () => {
    const interaction = createDiscordInteraction();
    interaction.reply.mockRejectedValueOnce({
      status: 404,
      message: "Unknown interaction",
    });
    const harness = await createDiscordSlashHarness({
      interaction,
      dispatchImplementation: async (call) => {
        await call.dispatcherOptions.deliver?.(createFinalTextPayload("late"), {
          kind: "final",
        } as never);
        return {
          counts: {
            final: 1,
            block: 0,
            tool: 0,
          },
        } as never;
      },
    });

    await expect(harness.run()).resolves.toBeUndefined();

    const state = harness.getStableState();
    expect(state.dispatchCount).toBe(1);
    expect(state.interactionReplyCount).toBe(1);
    expect(state.interactionFollowUpCount).toBe(0);
  });
});
