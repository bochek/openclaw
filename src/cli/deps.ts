import type { OutboundSendDeps } from "../infra/outbound/send-deps.js";
import { createLazyRuntimeSurface } from "../shared/lazy-runtime.js";
import { createOutboundSendDepsFromCliSource } from "./outbound-send-mapping.js";

/**
 * Lazy-loaded per-channel send functions, keyed by channel ID.
 * Values are proxy functions that dynamically import the real module on first use.
 */
export type CliDeps = { [channelId: string]: unknown };
type RuntimeSend = {
  sendMessage: (...args: unknown[]) => Promise<unknown>;
};
type RuntimeSendModule = {
  runtimeSend: RuntimeSend;
};
type RuntimeSendLoader = () => Promise<RuntimeSendModule>;

// Per-channel module caches for lazy loading.
const senderCache = new Map<string, Promise<RuntimeSend>>();
const runtimeSendLoaders: Record<string, RuntimeSendLoader> = {
  whatsapp: () => import("./send-runtime/whatsapp.js") as Promise<RuntimeSendModule>,
  telegram: () => import("./send-runtime/telegram.js") as Promise<RuntimeSendModule>,
  discord: () => import("./send-runtime/discord.js") as Promise<RuntimeSendModule>,
  slack: () => import("./send-runtime/slack.js") as Promise<RuntimeSendModule>,
  signal: () => import("./send-runtime/signal.js") as Promise<RuntimeSendModule>,
  imessage: () => import("./send-runtime/imessage.js") as Promise<RuntimeSendModule>,
};

/**
 * Create a lazy-loading send function proxy for a channel.
 * The channel's module is loaded on first call and cached for reuse.
 */
function createLazySender(
  channelId: string,
  loader: () => Promise<RuntimeSendModule>,
): (...args: unknown[]) => Promise<unknown> {
  const loadRuntimeSend = createLazyRuntimeSurface(loader, ({ runtimeSend }) => runtimeSend);
  return async (...args: unknown[]) => {
    let cached = senderCache.get(channelId);
    if (!cached) {
      cached = loadRuntimeSend();
      senderCache.set(channelId, cached);
    }
    const runtimeSend = await cached;
    return await runtimeSend.sendMessage(...args);
  };
}

export function createDefaultDeps(): CliDeps {
  // Keep the default dependency barrel limited to lazy senders so callers that
  // only need outbound deps do not pull channel runtime boundaries on import.
  return {
    whatsapp: createLazySender("whatsapp", runtimeSendLoaders.whatsapp),
    telegram: createLazySender("telegram", runtimeSendLoaders.telegram),
    discord: createLazySender("discord", runtimeSendLoaders.discord),
    slack: createLazySender("slack", runtimeSendLoaders.slack),
    signal: createLazySender("signal", runtimeSendLoaders.signal),
    imessage: createLazySender("imessage", runtimeSendLoaders.imessage),
  };
}

export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return createOutboundSendDepsFromCliSource(deps);
}

export const __testing = {
  resetSenderCacheForTest(): void {
    senderCache.clear();
  },
  setRuntimeSendLoaderForTest(channelId: string, loader: RuntimeSendLoader): void {
    runtimeSendLoaders[channelId] = loader;
    senderCache.delete(channelId);
  },
  resetRuntimeSendLoadersForTest(): void {
    runtimeSendLoaders.whatsapp = () =>
      import("./send-runtime/whatsapp.js") as Promise<RuntimeSendModule>;
    runtimeSendLoaders.telegram = () =>
      import("./send-runtime/telegram.js") as Promise<RuntimeSendModule>;
    runtimeSendLoaders.discord = () =>
      import("./send-runtime/discord.js") as Promise<RuntimeSendModule>;
    runtimeSendLoaders.slack = () =>
      import("./send-runtime/slack.js") as Promise<RuntimeSendModule>;
    runtimeSendLoaders.signal = () =>
      import("./send-runtime/signal.js") as Promise<RuntimeSendModule>;
    runtimeSendLoaders.imessage = () =>
      import("./send-runtime/imessage.js") as Promise<RuntimeSendModule>;
    senderCache.clear();
  },
};
