import { monitorDiscordProvider } from "../../../extensions/discord/src/monitor/provider.js";
import { probeDiscord } from "../../../extensions/discord/src/probe.js";
import type { PluginRuntimeChannel } from "./types-channel.js";

export const runtimeDiscordProvider = {
  monitorDiscordProvider,
  probeDiscord,
} satisfies Pick<PluginRuntimeChannel["discord"], "monitorDiscordProvider" | "probeDiscord">;
