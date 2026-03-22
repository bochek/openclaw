import { auditDiscordChannelPermissions } from "../../../extensions/discord/src/audit.js";
import {
  listDiscordDirectoryGroupsLive,
  listDiscordDirectoryPeersLive,
} from "../../../extensions/discord/src/directory-live.js";
import { resolveDiscordChannelAllowlist } from "../../../extensions/discord/src/resolve-channels.js";
import { resolveDiscordUserAllowlist } from "../../../extensions/discord/src/resolve-users.js";
import type { PluginRuntimeChannel } from "./types-channel.js";

export const runtimeDiscordDirectory = {
  auditChannelPermissions: auditDiscordChannelPermissions,
  listDirectoryGroupsLive: listDiscordDirectoryGroupsLive,
  listDirectoryPeersLive: listDiscordDirectoryPeersLive,
  resolveChannelAllowlist: resolveDiscordChannelAllowlist,
  resolveUserAllowlist: resolveDiscordUserAllowlist,
} satisfies Pick<
  PluginRuntimeChannel["discord"],
  | "auditChannelPermissions"
  | "listDirectoryGroupsLive"
  | "listDirectoryPeersLive"
  | "resolveChannelAllowlist"
  | "resolveUserAllowlist"
>;
