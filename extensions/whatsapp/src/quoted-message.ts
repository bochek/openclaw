import type { MiscMessageGenerationOptions } from "@whiskeysockets/baileys";

export type QuotedMessageKey = {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string;
  body?: string;
};

export function buildQuotedMessageKey(params: {
  replyToId?: string | null;
  remoteJid?: string | null;
  fromMe?: boolean;
  participant?: string;
  body?: string;
}): QuotedMessageKey | undefined {
  const id = params.replyToId?.trim();
  const remoteJid = params.remoteJid?.trim();
  if (!id || !remoteJid) {
    return undefined;
  }
  return {
    id,
    remoteJid,
    fromMe: params.fromMe ?? false,
    participant: params.participant ?? undefined,
    body: params.body,
  };
}

export function buildQuotedMessageOptions(
  key: QuotedMessageKey | undefined,
): MiscMessageGenerationOptions | undefined {
  if (!key) {
    return undefined;
  }
  return {
    quoted: {
      key: {
        remoteJid: key.remoteJid,
        id: key.id,
        fromMe: key.fromMe,
        participant: key.participant,
      },
      message: { conversation: key.body || "" },
    },
  } as MiscMessageGenerationOptions;
}
