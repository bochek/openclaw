import { Type } from "@sinclair/typebox";
import { ChatSendSessionKeyString, InputProvenanceSchema, NonEmptyString } from "./primitives.js";

export const LogsTailParamsSchema = Type.Object(
  {
    cursor: Type.Optional(Type.Integer({ minimum: 0 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
    maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000_000 })),
  },
  { additionalProperties: false },
);

export const LogsTailResultSchema = Type.Object(
  {
    file: NonEmptyString,
    cursor: Type.Integer({ minimum: 0 }),
    size: Type.Integer({ minimum: 0 }),
    lines: Type.Array(Type.String()),
    truncated: Type.Optional(Type.Boolean()),
    reset: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

// WebChat/WebSocket-native chat methods
export const ChatHistoryParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
    maxChars: Type.Optional(Type.Integer({ minimum: 1, maximum: 500_000 })),
  },
  { additionalProperties: false },
);

export const ChatSendParamsSchema = Type.Object(
  {
    sessionKey: ChatSendSessionKeyString,
    message: Type.String(),
    thinking: Type.Optional(Type.String()),
    deliver: Type.Optional(Type.Boolean()),
    originatingChannel: Type.Optional(Type.String()),
    originatingTo: Type.Optional(Type.String()),
    originatingAccountId: Type.Optional(Type.String()),
    originatingThreadId: Type.Optional(Type.String()),
    attachments: Type.Optional(Type.Array(Type.Unknown())),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    systemInputProvenance: Type.Optional(InputProvenanceSchema),
    systemProvenanceReceipt: Type.Optional(Type.String()),
    idempotencyKey: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChatAbortParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    runId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ChatInjectParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    message: NonEmptyString,
    label: Type.Optional(Type.String({ maxLength: 100 })),
  },
  { additionalProperties: false },
);

export const ChatVoiceStartParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChatVoiceAudioParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    audio: NonEmptyString,
    format: Type.Optional(Type.String()),
    sampleRate: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export const ChatVoiceCommitParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    transcript: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ChatVoiceInterruptParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChatVoiceStopParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChatVoiceEventSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    state: Type.Union([
      Type.Literal("ready"),
      Type.Literal("speech_start"),
      Type.Literal("partial_transcript"),
      Type.Literal("final_transcript"),
      Type.Literal("assistant_started"),
      Type.Literal("assistant_completed"),
      Type.Literal("playback_clear"),
      Type.Literal("interrupted"),
      Type.Literal("error"),
      Type.Literal("closed"),
    ]),
    transcript: Type.Optional(Type.String()),
    runId: Type.Optional(Type.String()),
    errorMessage: Type.Optional(Type.String()),
    playbackEnabled: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const ChatEventSchema = Type.Object(
  {
    runId: NonEmptyString,
    sessionKey: NonEmptyString,
    seq: Type.Integer({ minimum: 0 }),
    state: Type.Union([
      Type.Literal("delta"),
      Type.Literal("final"),
      Type.Literal("aborted"),
      Type.Literal("error"),
    ]),
    message: Type.Optional(Type.Unknown()),
    errorMessage: Type.Optional(Type.String()),
    usage: Type.Optional(Type.Unknown()),
    stopReason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
