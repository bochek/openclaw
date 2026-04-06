import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { RealtimeTranscriptionProviderPlugin } from "../plugins/types.js";
import { RealtimeTranscriptionSessionManager } from "./realtime-transcription-session-manager.js";

function createProvider(params?: {
  id?: string;
  configured?: boolean;
  onCreate?: (callbacks: Record<string, unknown>) => void;
}): RealtimeTranscriptionProviderPlugin {
  return {
    id: params?.id ?? "openai",
    label: "Test",
    autoSelectOrder: 1,
    resolveConfig: ({ rawConfig }) => rawConfig,
    isConfigured: () => params?.configured ?? true,
    createSession: (req) => {
      params?.onCreate?.(req as unknown as Record<string, unknown>);
      return {
        connect: async () => {},
        sendAudio: vi.fn(),
        close: vi.fn(),
        isConnected: () => true,
      };
    },
  };
}

describe("RealtimeTranscriptionSessionManager", () => {
  it("starts a session, auto-selects the first configured provider, and queues events", async () => {
    let callbacks: Record<string, unknown> | undefined;
    const provider = createProvider({
      onCreate: (req) => {
        callbacks = req;
      },
    });
    const manager = new RealtimeTranscriptionSessionManager({
      loadConfig: () => ({}) as OpenClawConfig,
      listProviders: () => [provider],
      getProvider: () => provider,
      now: () => 123,
      createId: () => "session-1",
    });

    const started = await manager.startSession({
      format: "s16le",
      sampleRate: 16000,
      channels: 1,
    });
    expect(started).toEqual({
      sessionId: "session-1",
      provider: "openai",
      format: "s16le",
      sampleRate: 16000,
      channels: 1,
    });

    (callbacks?.onPartial as ((value: string) => void) | undefined)?.("hello");
    (callbacks?.onTranscript as ((value: string) => void) | undefined)?.("hello world");

    const pulled = manager.pullEvents({ sessionId: "session-1" });
    expect(pulled.events).toEqual([
      { type: "session.started", provider: "openai", transport: "gateway", timestamp: 123 },
      { type: "partial", text: "hello", timestamp: 123 },
      { type: "final", text: "hello world", timestamp: 123 },
    ]);
  });

  it("rejects unsupported audio shapes", async () => {
    const provider = createProvider();
    const manager = new RealtimeTranscriptionSessionManager({
      loadConfig: () => ({}) as OpenClawConfig,
      listProviders: () => [provider],
      getProvider: () => provider,
      now: () => 123,
      createId: () => "session-1",
    });

    await expect(
      manager.startSession({
        format: "s16le",
        sampleRate: 16000,
        channels: 2,
      }),
    ).rejects.toThrow(/mono audio/);
  });

  it("returns pending terminal events on finish and removes the session", async () => {
    let callbacks: Record<string, unknown> | undefined;
    const close = vi.fn();
    const provider = createProvider({
      onCreate: (req) => {
        callbacks = req;
      },
    });
    provider.createSession = (req) => {
      callbacks = req as unknown as Record<string, unknown>;
      return {
        connect: async () => {},
        sendAudio: vi.fn(),
        close,
        isConnected: () => false,
      };
    };
    const manager = new RealtimeTranscriptionSessionManager({
      loadConfig: () => ({}) as OpenClawConfig,
      listProviders: () => [provider],
      getProvider: () => provider,
      now: () => 123,
      createId: () => "session-1",
    });

    await manager.startSession({
      format: "s16le",
      sampleRate: 16000,
      channels: 1,
    });
    (callbacks?.onPartial as ((value: string) => void) | undefined)?.("hello");

    expect(manager.finishSession({ sessionId: "session-1" })).toEqual({
      sessionId: "session-1",
      provider: "openai",
      closed: true,
      events: [
        { type: "session.started", provider: "openai", transport: "gateway", timestamp: 123 },
        { type: "partial", text: "hello", timestamp: 123 },
        { type: "session.ended", reason: "client_finish", timestamp: 123 },
      ],
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(() => manager.pullEvents({ sessionId: "session-1" })).toThrow(
      /Unknown realtime transcription session/,
    );
  });

  it("fails when no configured provider is available", async () => {
    const provider = createProvider({ configured: false });
    const manager = new RealtimeTranscriptionSessionManager({
      loadConfig: () => ({}) as OpenClawConfig,
      listProviders: () => [provider],
      getProvider: () => provider,
      now: () => 123,
      createId: () => "session-1",
    });

    await expect(
      manager.startSession({
        format: "s16le",
        sampleRate: 16000,
        channels: 1,
      }),
    ).rejects.toThrow(/No configured realtime transcription provider/);
  });
});
