import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { MatrixAuth } from "../client.js";
import type { MatrixClient } from "../sdk.js";
import type { MatrixRawEvent } from "./types.js";
import { EventType } from "./types.js";

const VERIFICATION_EVENT_PREFIX = "m.key.verification.";
const VERIFICATION_REQUEST_MSGTYPE = "m.key.verification.request";
const MAX_TRACKED_VERIFICATION_EVENTS = 1024;

type MatrixVerificationSummaryLike = {
  id: string;
  transactionId?: string;
  otherUserId: string;
  phaseName: string;
  sas?: {
    decimal?: [number, number, number];
    emoji?: Array<[string, string]>;
  };
};

function trimMaybeString(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readVerificationSignal(event: MatrixRawEvent): {
  stage: "request" | "start" | "cancel" | "done" | "other";
  flowId: string | null;
} | null {
  const type = trimMaybeString(event?.type) ?? "";
  const content = event?.content ?? {};
  const msgtype = trimMaybeString((content as { msgtype?: unknown }).msgtype) ?? "";
  if (type === EventType.RoomMessage && msgtype === VERIFICATION_REQUEST_MSGTYPE) {
    return {
      stage: "request",
      flowId: trimMaybeString(event.event_id),
    };
  }
  if (!type.startsWith(VERIFICATION_EVENT_PREFIX)) {
    return null;
  }

  const flowId = trimMaybeString(
    (content as { "m.relates_to"?: { event_id?: unknown } })["m.relates_to"]?.event_id,
  );
  if (type === "m.key.verification.start") {
    return { stage: "start", flowId };
  }
  if (type === "m.key.verification.cancel") {
    return { stage: "cancel", flowId };
  }
  if (type === "m.key.verification.done") {
    return { stage: "done", flowId };
  }
  return { stage: "other", flowId };
}

function formatVerificationStageNotice(params: {
  stage: "request" | "start" | "cancel" | "done" | "other";
  senderId: string;
  event: MatrixRawEvent;
}): string | null {
  const { stage, senderId, event } = params;
  const content = event.content as { code?: unknown; reason?: unknown };
  switch (stage) {
    case "request":
      return `Matrix verification request received from ${senderId}.`;
    case "start":
      return `Matrix verification started with ${senderId}.`;
    case "done":
      return `Matrix verification completed with ${senderId}.`;
    case "cancel": {
      const code = trimMaybeString(content.code);
      const reason = trimMaybeString(content.reason);
      if (code && reason) {
        return `Matrix verification cancelled by ${senderId} (${code}: ${reason}).`;
      }
      if (reason) {
        return `Matrix verification cancelled by ${senderId} (${reason}).`;
      }
      return `Matrix verification cancelled by ${senderId}.`;
    }
    default:
      return null;
  }
}

function formatVerificationSasNotice(summary: MatrixVerificationSummaryLike): string | null {
  const sas = summary.sas;
  if (!sas) {
    return null;
  }
  const emojiLine =
    Array.isArray(sas.emoji) && sas.emoji.length > 0
      ? `SAS emoji: ${sas.emoji
          .map(
            ([emoji, name]) => `${trimMaybeString(emoji) ?? "?"} ${trimMaybeString(name) ?? "?"}`,
          )
          .join(" | ")}`
      : null;
  const decimalLine =
    Array.isArray(sas.decimal) && sas.decimal.length === 3
      ? `SAS decimal: ${sas.decimal.join(" ")}`
      : null;
  if (!emojiLine && !decimalLine) {
    return null;
  }
  const lines = [`Matrix verification SAS with ${summary.otherUserId}:`];
  if (emojiLine) {
    lines.push(emojiLine);
  }
  if (decimalLine) {
    lines.push(decimalLine);
  }
  lines.push("If both sides match, choose 'They match' in your Matrix app.");
  return lines.join("\n");
}

function createSyntheticVerificationMessage(params: {
  senderId: string;
  sourceEventId: string | null;
  body: string;
  originServerTs?: number;
}): MatrixRawEvent {
  const { senderId, sourceEventId, body, originServerTs } = params;
  const safeEventId = sourceEventId?.replace(/[^A-Za-z0-9_.=-]/g, "_") ?? "unknown";
  return {
    event_id: `mxjs-verification-${safeEventId}-${Date.now().toString(36)}`,
    sender: senderId,
    type: EventType.RoomMessage,
    origin_server_ts: originServerTs ?? Date.now(),
    content: {
      msgtype: "m.notice",
      body,
    },
    unsigned: {
      age: 0,
    },
  };
}

async function resolveVerificationSummaryByFlowId(
  client: MatrixClient,
  flowId: string | null,
): Promise<MatrixVerificationSummaryLike | null> {
  if (!flowId || !client.crypto) {
    return null;
  }
  const list = await client.crypto.listVerifications();
  const summary = list.find((entry) => entry.transactionId === flowId);
  return summary ?? null;
}

function trackBounded(set: Set<string>, value: string): boolean {
  if (!value || set.has(value)) {
    return false;
  }
  set.add(value);
  if (set.size > MAX_TRACKED_VERIFICATION_EVENTS) {
    const oldest = set.values().next().value;
    if (typeof oldest === "string") {
      set.delete(oldest);
    }
  }
  return true;
}

export function registerMatrixMonitorEvents(params: {
  client: MatrixClient;
  auth: MatrixAuth;
  logVerboseMessage: (message: string) => void;
  warnedEncryptedRooms: Set<string>;
  warnedCryptoMissingRooms: Set<string>;
  logger: { warn: (meta: Record<string, unknown>, message: string) => void };
  formatNativeDependencyHint: PluginRuntime["system"]["formatNativeDependencyHint"];
  onRoomMessage: (roomId: string, event: MatrixRawEvent) => void | Promise<void>;
}): void {
  const {
    client,
    auth,
    logVerboseMessage,
    warnedEncryptedRooms,
    warnedCryptoMissingRooms,
    logger,
    formatNativeDependencyHint,
    onRoomMessage,
  } = params;
  const routedVerificationEvents = new Set<string>();
  const routedVerificationSasFingerprints = new Set<string>();

  client.on("room.message", onRoomMessage);

  client.on("room.encrypted_event", (roomId: string, event: MatrixRawEvent) => {
    const eventId = event?.event_id ?? "unknown";
    const eventType = event?.type ?? "unknown";
    logVerboseMessage(`matrix: encrypted event room=${roomId} type=${eventType} id=${eventId}`);
  });

  client.on("room.decrypted_event", (roomId: string, event: MatrixRawEvent) => {
    const eventId = event?.event_id ?? "unknown";
    const eventType = event?.type ?? "unknown";
    logVerboseMessage(`matrix: decrypted event room=${roomId} type=${eventType} id=${eventId}`);
  });

  client.on(
    "room.failed_decryption",
    async (roomId: string, event: MatrixRawEvent, error: Error) => {
      logger.warn(
        { roomId, eventId: event.event_id, error: error.message },
        "Failed to decrypt message",
      );
      logVerboseMessage(
        `matrix: failed decrypt room=${roomId} id=${event.event_id ?? "unknown"} error=${error.message}`,
      );
    },
  );

  client.on("room.invite", (roomId: string, event: MatrixRawEvent) => {
    const eventId = event?.event_id ?? "unknown";
    const sender = event?.sender ?? "unknown";
    const isDirect = (event?.content as { is_direct?: boolean } | undefined)?.is_direct === true;
    logVerboseMessage(
      `matrix: invite room=${roomId} sender=${sender} direct=${String(isDirect)} id=${eventId}`,
    );
  });

  client.on("room.join", (roomId: string, event: MatrixRawEvent) => {
    const eventId = event?.event_id ?? "unknown";
    logVerboseMessage(`matrix: join room=${roomId} id=${eventId}`);
  });

  client.on("room.event", (roomId: string, event: MatrixRawEvent) => {
    const eventType = event?.type ?? "unknown";
    if (eventType === EventType.RoomMessageEncrypted) {
      logVerboseMessage(
        `matrix: encrypted raw event room=${roomId} id=${event?.event_id ?? "unknown"}`,
      );
      if (auth.encryption !== true && !warnedEncryptedRooms.has(roomId)) {
        warnedEncryptedRooms.add(roomId);
        const warning =
          "matrix: encrypted event received without encryption enabled; set channels.matrix-js.encryption=true and verify the device to decrypt";
        logger.warn({ roomId }, warning);
      }
      if (auth.encryption === true && !client.crypto && !warnedCryptoMissingRooms.has(roomId)) {
        warnedCryptoMissingRooms.add(roomId);
        const hint = formatNativeDependencyHint({
          packageName: "@matrix-org/matrix-sdk-crypto-nodejs",
          manager: "pnpm",
          downloadCommand: "node node_modules/@matrix-org/matrix-sdk-crypto-nodejs/download-lib.js",
        });
        const warning = `matrix: encryption enabled but crypto is unavailable; ${hint}`;
        logger.warn({ roomId }, warning);
      }
      return;
    }
    if (eventType === EventType.RoomMember) {
      const membership = (event?.content as { membership?: string } | undefined)?.membership;
      const stateKey = (event as { state_key?: string }).state_key ?? "";
      logVerboseMessage(
        `matrix: member event room=${roomId} stateKey=${stateKey} membership=${membership ?? "unknown"}`,
      );
    }

    const senderId = trimMaybeString(event?.sender);
    if (!senderId) {
      return;
    }
    const signal = readVerificationSignal(event);
    if (!signal) {
      return;
    }

    void (async () => {
      const flowId = signal.flowId;
      const sourceEventId = trimMaybeString(event?.event_id);
      const sourceFingerprint = sourceEventId ?? `${senderId}:${eventType}:${flowId ?? "none"}`;
      if (!trackBounded(routedVerificationEvents, sourceFingerprint)) {
        return;
      }

      const stageNotice = formatVerificationStageNotice({ stage: signal.stage, senderId, event });
      const summary = await resolveVerificationSummaryByFlowId(client, flowId).catch(() => null);
      const sasNotice = summary ? formatVerificationSasNotice(summary) : null;

      const notices: string[] = [];
      if (stageNotice) {
        notices.push(stageNotice);
      }
      if (summary && sasNotice) {
        const sasFingerprint = `${summary.id}:${JSON.stringify(summary.sas)}`;
        if (trackBounded(routedVerificationSasFingerprints, sasFingerprint)) {
          notices.push(sasNotice);
        }
      }
      if (notices.length === 0) {
        return;
      }

      for (const body of notices) {
        await onRoomMessage(
          roomId,
          createSyntheticVerificationMessage({
            senderId,
            sourceEventId,
            body,
            originServerTs: event.origin_server_ts,
          }),
        );
      }
    })().catch((err) => {
      logVerboseMessage(`matrix: failed routing verification event: ${String(err)}`);
    });
  });
}
