import type { RealtimeTranscriptionSession } from "../realtime-transcription/provider-types.js";

export type ChatVoiceEventPayload = {
  sessionKey: string;
  state:
    | "ready"
    | "speech_start"
    | "partial_transcript"
    | "final_transcript"
    | "assistant_started"
    | "assistant_completed"
    | "playback_clear"
    | "interrupted"
    | "error"
    | "closed";
  transcript?: string;
  runId?: string;
  errorMessage?: string;
  playbackEnabled?: boolean;
};

export type ChatVoiceSessionEntry = {
  sessionKey: string;
  connId: string;
  providerId: string;
  playbackEnabled: boolean;
  sttSession: RealtimeTranscriptionSession;
  transcriptPartial: string;
  transcriptFinal: string;
  activeRunId: string | null;
};

const sessionsByKey = new Map<string, ChatVoiceSessionEntry>();
const sessionKeyByRunId = new Map<string, string>();

export function getChatVoiceSession(sessionKey: string): ChatVoiceSessionEntry | undefined {
  return sessionsByKey.get(sessionKey);
}

export function setChatVoiceSession(entry: ChatVoiceSessionEntry) {
  const existing = sessionsByKey.get(entry.sessionKey);
  if (existing && existing !== entry) {
    try {
      existing.sttSession.close();
    } catch {
      // ignore replacement cleanup errors
    }
    if (existing.activeRunId) {
      sessionKeyByRunId.delete(existing.activeRunId);
    }
  }
  sessionsByKey.set(entry.sessionKey, entry);
}

export function deleteChatVoiceSession(sessionKey: string): ChatVoiceSessionEntry | undefined {
  const entry = sessionsByKey.get(sessionKey);
  if (!entry) {
    return undefined;
  }
  sessionsByKey.delete(sessionKey);
  if (entry.activeRunId) {
    sessionKeyByRunId.delete(entry.activeRunId);
  }
  return entry;
}

export function setChatVoiceRunId(sessionKey: string, runId: string | null) {
  const entry = sessionsByKey.get(sessionKey);
  if (!entry) {
    return;
  }
  if (entry.activeRunId) {
    sessionKeyByRunId.delete(entry.activeRunId);
  }
  entry.activeRunId = runId;
  if (runId) {
    sessionKeyByRunId.set(runId, sessionKey);
  }
}

export function getChatVoiceSessionByRunId(runId: string): ChatVoiceSessionEntry | undefined {
  const sessionKey = sessionKeyByRunId.get(runId);
  return sessionKey ? sessionsByKey.get(sessionKey) : undefined;
}

export function closeChatVoiceSessionsForConn(
  connId: string,
  emit: (connId: string, payload: ChatVoiceEventPayload) => void,
) {
  for (const entry of sessionsByKey.values()) {
    if (entry.connId !== connId) {
      continue;
    }
    try {
      entry.sttSession.close();
    } catch {
      // ignore cleanup errors on disconnect
    }
    deleteChatVoiceSession(entry.sessionKey);
    emit(connId, {
      sessionKey: entry.sessionKey,
      state: "closed",
      playbackEnabled: entry.playbackEnabled,
    });
  }
}
