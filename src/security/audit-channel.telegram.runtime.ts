import { isNumericTelegramUserId, normalizeTelegramAllowFromEntry } from "../plugin-sdk/telegram.js";

export const auditChannelTelegramRuntime = {
  isNumericTelegramUserId,
  normalizeTelegramAllowFromEntry,
};
