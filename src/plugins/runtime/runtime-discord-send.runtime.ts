import { editChannelDiscord } from "../../../extensions/discord/src/send.channels.js";
import { sendDiscordComponentMessage } from "../../../extensions/discord/src/send.components.js";
import {
  createThreadDiscord,
  deleteMessageDiscord,
  editMessageDiscord,
  pinMessageDiscord,
  unpinMessageDiscord,
} from "../../../extensions/discord/src/send.messages.js";
import {
  sendMessageDiscord,
  sendPollDiscord,
} from "../../../extensions/discord/src/send.outbound.js";
import { sendTypingDiscord } from "../../../extensions/discord/src/send.typing.js";
import type { PluginRuntimeChannel } from "./types-channel.js";

export const runtimeDiscordSend = {
  sendComponentMessage: sendDiscordComponentMessage,
  sendMessageDiscord,
  sendPollDiscord,
  typing: {
    pulse: sendTypingDiscord,
  },
  conversationActions: {
    editMessage: editMessageDiscord,
    deleteMessage: deleteMessageDiscord,
    pinMessage: pinMessageDiscord,
    unpinMessage: unpinMessageDiscord,
    createThread: createThreadDiscord,
    editChannel: editChannelDiscord,
  },
} satisfies Pick<
  PluginRuntimeChannel["discord"],
  "sendComponentMessage" | "sendMessageDiscord" | "sendPollDiscord"
> & {
  typing: Pick<PluginRuntimeChannel["discord"]["typing"], "pulse">;
  conversationActions: Pick<
    PluginRuntimeChannel["discord"]["conversationActions"],
    "editMessage" | "deleteMessage" | "pinMessage" | "unpinMessage" | "createThread" | "editChannel"
  >;
};
