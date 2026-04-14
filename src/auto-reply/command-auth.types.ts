import type { ChannelId } from "../channels/plugins/channel-id.types.js";

export type ResolvedCommandAuthorization = {
  providerId?: ChannelId;
  ownerList: string[];
  senderId?: string;
  senderIsOwner: boolean;
  isAuthorizedSender: boolean;
  from?: string;
  to?: string;
};

export type CommandAuthorization = ResolvedCommandAuthorization;
