import { ChannelType } from "discord-api-types/v10";
import type { ReplyPayload } from "openclaw/plugin-sdk/reply-runtime";
import { vi } from "vitest";
import type { NativeCommandSpec } from "../../../src/auto-reply/commands-registry.js";
import * as dispatcherModule from "../../../src/auto-reply/reply/provider-dispatcher.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import * as pluginCommandsModule from "../../../src/plugins/commands.js";
import { DiscordMessageListener } from "./monitor/listeners.js";
import { createMockCommandInteraction } from "./monitor/native-command.test-helpers.js";
import { createNoopThreadBindingManager } from "./monitor/thread-bindings.js";

type EnsureConfiguredBindingRouteReadyFn =
  typeof import("openclaw/plugin-sdk/conversation-runtime").ensureConfiguredBindingRouteReady;

const { ensureConfiguredBindingRouteReadyMock } = vi.hoisted(() => ({
  ensureConfiguredBindingRouteReadyMock: vi.fn<EnsureConfiguredBindingRouteReadyFn>(async () => ({
    ok: true,
  })),
}));

export function getEnsureConfiguredBindingRouteReadyMock() {
  return ensureConfiguredBindingRouteReadyMock;
}

vi.mock("openclaw/plugin-sdk/conversation-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/conversation-runtime")>();
  return {
    ...actual,
    ensureConfiguredBindingRouteReady: (...args: unknown[]) =>
      ensureConfiguredBindingRouteReadyMock(
        ...(args as Parameters<EnsureConfiguredBindingRouteReadyFn>),
      ),
  };
});

export function createDiscordPhase3Config(overrides?: OpenClawConfig): OpenClawConfig {
  return {
    channels: {
      discord: {
        dm: { enabled: true, policy: "open" },
      },
    },
    ...(overrides ?? {}),
  } as OpenClawConfig;
}

export function createDiscordListenerEvent(params?: {
  messageId?: string;
  channelId?: string;
  content?: string;
}) {
  const channelId = params?.channelId ?? "ch-1";
  const messageId = params?.messageId ?? "m-1";
  return {
    channel_id: channelId,
    author: { id: "user-1" },
    message: {
      id: messageId,
      author: { id: "user-1", bot: false },
      content: params?.content ?? "hello",
      channel_id: channelId,
      attachments: [],
    },
  };
}

export function createDiscordListenerHarness(params?: {
  handler?: (data: unknown, client: unknown) => Promise<void>;
}) {
  let admissions = 0;
  const customHandler = params?.handler;
  const handler = vi.fn(async (data: unknown, client: unknown) => {
    await customHandler?.(data, client);
  });
  const listener = new DiscordMessageListener(
    async (data, client) => {
      await handler(data, client);
    },
    undefined,
    () => {
      admissions += 1;
    },
  );

  return {
    listener,
    handler,
    getStableState: () => ({
      listenerAdmissions: admissions,
      handlerCalls: handler.mock.calls.length,
    }),
  };
}

function createInteraction(params?: {
  channelType?: ChannelType;
  channelId?: string;
  guildId?: string | null;
  guildName?: string;
  interactionId?: string;
}) {
  return createMockCommandInteraction({
    userId: "owner",
    username: "tester",
    globalName: "Tester",
    channelType: params?.channelType ?? ChannelType.DM,
    channelId: params?.channelId ?? "dm-1",
    guildId: params?.guildId,
    guildName: params?.guildName,
    interactionId: params?.interactionId ?? "interaction-1",
  });
}

async function loadCreateDiscordNativeCommand() {
  return (await import("./monitor/native-command.js")).createDiscordNativeCommand;
}

async function createStatusCommand(cfg: OpenClawConfig) {
  const createDiscordNativeCommand = await loadCreateDiscordNativeCommand();
  return createDiscordNativeCommand({
    command: {
      name: "status",
      description: "Status",
      acceptsArgs: false,
    } satisfies NativeCommandSpec,
    cfg,
    discordConfig: cfg.channels?.discord ?? {},
    accountId: "default",
    sessionPrefix: "discord:slash",
    ephemeralDefault: true,
    threadBindings: createNoopThreadBindingManager("default"),
  });
}

export async function createDiscordSlashHarness(params?: {
  cfg?: OpenClawConfig;
  interaction?: ReturnType<typeof createInteraction>;
  dispatchImplementation?: (
    call: Parameters<typeof dispatcherModule.dispatchReplyWithDispatcher>[0],
  ) => Promise<Awaited<ReturnType<typeof dispatcherModule.dispatchReplyWithDispatcher>>>;
}) {
  const interaction = params?.interaction ?? createInteraction();
  const cfg = params?.cfg ?? createDiscordPhase3Config();
  vi.spyOn(pluginCommandsModule, "matchPluginCommand").mockReturnValue(null);
  const dispatchSpy = vi.spyOn(dispatcherModule, "dispatchReplyWithDispatcher").mockImplementation(
    params?.dispatchImplementation ??
      (async () =>
        ({
          counts: {
            final: 1,
            block: 0,
            tool: 0,
          },
        }) as never),
  );
  const command = await createStatusCommand(cfg);

  return {
    interaction,
    dispatchSpy,
    run: async () => {
      await (command as { run: (interaction: unknown) => Promise<void> }).run(
        interaction as unknown,
      );
    },
    getStableState: () => {
      const dispatchCall = dispatchSpy.mock.calls[0]?.[0] as
        | {
            ctx?: { SessionKey?: string; CommandTargetSessionKey?: string };
          }
        | undefined;
      return {
        dispatchCount: dispatchSpy.mock.calls.length,
        interactionReplyCount: interaction.reply.mock.calls.length,
        interactionFollowUpCount: interaction.followUp.mock.calls.length,
        sessionKey: dispatchCall?.ctx?.SessionKey,
        commandTargetSessionKey: dispatchCall?.ctx?.CommandTargetSessionKey,
      };
    },
  };
}

export function createDiscordInteraction(params?: {
  channelType?: ChannelType;
  channelId?: string;
  guildId?: string | null;
  guildName?: string;
  interactionId?: string;
}) {
  return createInteraction(params);
}

export function createFinalTextPayload(text: string): ReplyPayload {
  return { text };
}
