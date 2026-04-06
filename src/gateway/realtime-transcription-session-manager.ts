import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "../config/config.js";
import { loadConfig } from "../config/config.js";
import type { RealtimeTranscriptionProviderPlugin } from "../plugins/types.js";
import {
  getRealtimeTranscriptionProvider,
  listRealtimeTranscriptionProviders,
} from "../realtime-transcription/provider-registry.js";
import type {
  RealtimeTranscriptionProviderConfig,
  RealtimeTranscriptionSession,
} from "../realtime-transcription/provider-types.js";

type AudioFormat = "s16le" | "pcm16" | "g711_ulaw";

export type RealtimeTranscriptionSessionEvent =
  | { type: "session.started"; provider: string; transport: "gateway"; timestamp: number }
  | { type: "partial"; text: string; timestamp: number }
  | { type: "final"; text: string; timestamp: number }
  | { type: "warning"; message: string; timestamp: number }
  | { type: "error"; message: string; timestamp: number }
  | { type: "session.ended"; reason: string; timestamp: number };

type ManagedSession = {
  id: string;
  provider: string;
  format: AudioFormat;
  sampleRate: number;
  channels: number;
  session: RealtimeTranscriptionSession;
  events: RealtimeTranscriptionSessionEvent[];
  closed: boolean;
};

type SessionStartParams = {
  provider?: string;
  providerConfig?: RealtimeTranscriptionProviderConfig;
  format: AudioFormat;
  sampleRate: number;
  channels: number;
};

type ManagerDeps = {
  loadConfig: () => OpenClawConfig;
  listProviders: (cfg?: OpenClawConfig) => RealtimeTranscriptionProviderPlugin[];
  getProvider: (
    providerId: string | undefined,
    cfg?: OpenClawConfig,
  ) => RealtimeTranscriptionProviderPlugin | undefined;
  now: () => number;
  createId: () => string;
};

const defaultDeps: ManagerDeps = {
  loadConfig,
  listProviders: listRealtimeTranscriptionProviders,
  getProvider: getRealtimeTranscriptionProvider,
  now: () => Date.now(),
  createId: () => randomUUID(),
};

function normalizeAudioFormat(raw: string | undefined): AudioFormat | null {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (value === "s16le" || value === "pcm16" || value === "g711_ulaw") {
    return value;
  }
  return null;
}

function validateSessionShape(params: {
  format: AudioFormat;
  sampleRate: number;
  channels: number;
}) {
  if (!Number.isFinite(params.sampleRate) || params.sampleRate <= 0) {
    throw new Error("sampleRate must be a positive number.");
  }
  if (!Number.isFinite(params.channels) || params.channels <= 0) {
    throw new Error("channels must be a positive number.");
  }
  if (params.channels !== 1) {
    throw new Error("realtime transcription currently requires mono audio (channels=1).");
  }
  if (params.format === "g711_ulaw" && params.sampleRate !== 8000) {
    throw new Error("g711_ulaw realtime transcription requires sampleRate=8000.");
  }
}

function sortProviders(providers: RealtimeTranscriptionProviderPlugin[]) {
  return [...providers].toSorted((left, right) => {
    const leftOrder = left.autoSelectOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.autoSelectOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.id.localeCompare(right.id);
  });
}

function buildProviderConfig(params: {
  provider: RealtimeTranscriptionProviderPlugin;
  cfg: OpenClawConfig;
  providerConfig?: RealtimeTranscriptionProviderConfig;
  format: AudioFormat;
}): RealtimeTranscriptionProviderConfig {
  const rawConfig = {
    ...params.providerConfig,
    ...(params.format === "s16le" || params.format === "pcm16"
      ? { inputAudioFormat: "pcm16" }
      : params.format === "g711_ulaw"
        ? { inputAudioFormat: "g711_ulaw" }
        : {}),
  };
  return params.provider.resolveConfig?.({ cfg: params.cfg, rawConfig }) ?? rawConfig;
}

export class RealtimeTranscriptionSessionManager {
  private readonly sessions = new Map<string, ManagedSession>();

  constructor(private readonly deps: ManagerDeps = defaultDeps) {}

  async startSession(params: SessionStartParams) {
    validateSessionShape({
      format: params.format,
      sampleRate: params.sampleRate,
      channels: params.channels,
    });
    const cfg = this.deps.loadConfig();
    const provider = this.resolveProvider(params.provider, cfg, params);
    const providerConfig = buildProviderConfig({
      provider,
      cfg,
      providerConfig: params.providerConfig,
      format: params.format,
    });
    const sessionId = this.deps.createId();
    const events: RealtimeTranscriptionSessionEvent[] = [];
    const queueEvent = (event: RealtimeTranscriptionSessionEvent) => {
      events.push(event);
    };
    const session = provider.createSession({
      providerConfig,
      onPartial: (partial) => {
        if (partial.trim()) {
          queueEvent({ type: "partial", text: partial, timestamp: this.deps.now() });
        }
      },
      onTranscript: (transcript) => {
        if (transcript.trim()) {
          queueEvent({ type: "final", text: transcript, timestamp: this.deps.now() });
        }
      },
      onError: (error) => {
        queueEvent({
          type: "error",
          message: error.message || String(error),
          timestamp: this.deps.now(),
        });
      },
    });
    await session.connect();
    queueEvent({
      type: "session.started",
      provider: provider.id,
      transport: "gateway",
      timestamp: this.deps.now(),
    });
    this.sessions.set(sessionId, {
      id: sessionId,
      provider: provider.id,
      format: params.format,
      sampleRate: params.sampleRate,
      channels: params.channels,
      session,
      events,
      closed: false,
    });
    return {
      sessionId,
      provider: provider.id,
      format: params.format,
      sampleRate: params.sampleRate,
      channels: params.channels,
    };
  }

  pushAudio(params: { sessionId: string; audio: Buffer }) {
    const managed = this.getOpenSession(params.sessionId);
    managed.session.sendAudio(params.audio);
    return {
      sessionId: managed.id,
      acceptedBytes: params.audio.byteLength,
      connected: managed.session.isConnected(),
    };
  }

  pullEvents(params: { sessionId: string; limit?: number }) {
    const managed = this.getSession(params.sessionId);
    const requested = params.limit ?? (managed.events.length || 100);
    const count = Math.max(1, Math.floor(requested));
    const events = managed.events.splice(0, count);
    return {
      sessionId: managed.id,
      provider: managed.provider,
      connected: managed.session.isConnected(),
      closed: managed.closed,
      events,
    };
  }

  finishSession(params: { sessionId: string; reason?: string }) {
    const managed = this.getSession(params.sessionId);
    if (!managed.closed) {
      managed.closed = true;
      managed.session.close();
      managed.events.push({
        type: "session.ended",
        reason: params.reason?.trim() || "client_finish",
        timestamp: this.deps.now(),
      });
    }
    const events = managed.events.splice(0, managed.events.length);
    this.sessions.delete(params.sessionId);
    return {
      sessionId: managed.id,
      provider: managed.provider,
      closed: true,
      events,
    };
  }

  private resolveProvider(
    providerId: string | undefined,
    cfg: OpenClawConfig,
    params: SessionStartParams,
  ): RealtimeTranscriptionProviderPlugin {
    if (providerId?.trim()) {
      const provider = this.deps.getProvider(providerId, cfg);
      if (!provider) {
        throw new Error(`Unknown realtime transcription provider: ${providerId}`);
      }
      const providerConfig = buildProviderConfig({
        provider,
        cfg,
        providerConfig: params.providerConfig,
        format: params.format,
      });
      if (!provider.isConfigured({ cfg, providerConfig })) {
        throw new Error(`Realtime transcription provider "${provider.id}" is not configured.`);
      }
      return provider;
    }

    const provider = sortProviders(this.deps.listProviders(cfg)).find((candidate) => {
      const providerConfig = buildProviderConfig({
        provider: candidate,
        cfg,
        providerConfig: params.providerConfig,
        format: params.format,
      });
      return candidate.isConfigured({ cfg, providerConfig });
    });
    if (!provider) {
      throw new Error("No configured realtime transcription provider is available.");
    }
    return provider;
  }

  private getSession(sessionId: string): ManagedSession {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      throw new Error(`Unknown realtime transcription session: ${sessionId}`);
    }
    return managed;
  }

  private getOpenSession(sessionId: string): ManagedSession {
    const managed = this.getSession(sessionId);
    if (managed.closed) {
      throw new Error(`Realtime transcription session is already closed: ${sessionId}`);
    }
    return managed;
  }
}

const sharedManager = new RealtimeTranscriptionSessionManager();

export function getRealtimeTranscriptionSessionManager() {
  return sharedManager;
}

export const __testing = {
  normalizeAudioFormat,
};
