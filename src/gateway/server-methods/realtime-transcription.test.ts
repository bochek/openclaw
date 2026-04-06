import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  manager: {
    startSession: vi.fn(),
    pushAudio: vi.fn(),
    pullEvents: vi.fn(),
    finishSession: vi.fn(),
  },
}));

vi.mock("../realtime-transcription-session-manager.js", () => ({
  getRealtimeTranscriptionSessionManager: () => mocks.manager,
  __testing: {
    normalizeAudioFormat: (value: string | undefined) =>
      value === "s16le" || value === "pcm16" || value === "g711_ulaw" ? value : null,
  },
}));

import { realtimeTranscriptionHandlers } from "./realtime-transcription.js";

describe("realtimeTranscriptionHandlers", () => {
  beforeEach(() => {
    mocks.manager.startSession.mockReset();
    mocks.manager.pushAudio.mockReset();
    mocks.manager.pullEvents.mockReset();
    mocks.manager.finishSession.mockReset();
  });

  it("starts a session with validated audio metadata", async () => {
    mocks.manager.startSession.mockResolvedValue({ sessionId: "s1", provider: "openai" });
    const respond = vi.fn();

    await realtimeTranscriptionHandlers["realtimeTranscription.start"]({
      req: { method: "realtimeTranscription.start", id: "1" } as never,
      params: { format: "s16le", sampleRate: 16000, channels: 1 },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(mocks.manager.startSession).toHaveBeenCalledWith({
      provider: undefined,
      providerConfig: undefined,
      format: "s16le",
      sampleRate: 16000,
      channels: 1,
    });
    expect(respond).toHaveBeenCalledWith(true, { sessionId: "s1", provider: "openai" });
  });

  it("rejects invalid start formats", async () => {
    const respond = vi.fn();

    await realtimeTranscriptionHandlers["realtimeTranscription.start"]({
      req: { method: "realtimeTranscription.start", id: "1" } as never,
      params: { format: "wav", sampleRate: 16000, channels: 1 },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(mocks.manager.startSession).not.toHaveBeenCalled();
    expect(respond.mock.calls[0]?.[0]).toBe(false);
  });

  it("pushes audio chunks to an existing session", async () => {
    mocks.manager.pushAudio.mockReturnValue({ sessionId: "s1", acceptedBytes: 4, connected: true });
    const respond = vi.fn();

    await realtimeTranscriptionHandlers["realtimeTranscription.pushAudio"]({
      req: { method: "realtimeTranscription.pushAudio", id: "2" } as never,
      params: { sessionId: "s1", audio: Buffer.from("test").toString("base64") },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(mocks.manager.pushAudio).toHaveBeenCalledWith({
      sessionId: "s1",
      audio: expect.any(Buffer),
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ sessionId: "s1", acceptedBytes: 4 }),
    );
  });

  it("rejects malformed base64 audio payloads before forwarding to the manager", async () => {
    const respond = vi.fn();

    await realtimeTranscriptionHandlers["realtimeTranscription.pushAudio"]({
      req: { method: "realtimeTranscription.pushAudio", id: "2b" } as never,
      params: { sessionId: "s1", audio: "%%%not-base64%%%" },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(mocks.manager.pushAudio).not.toHaveBeenCalled();
    expect(respond.mock.calls[0]?.[0]).toBe(false);
    expect(JSON.stringify(respond.mock.calls[0]?.[2] ?? {})).toContain("audio must be base64 encoded");
  });

  it("returns final events from finish and lets the manager clean up immediately", async () => {
    mocks.manager.finishSession.mockReturnValue({
      sessionId: "s1",
      provider: "openai",
      closed: true,
      events: [{ type: "session.ended", reason: "client_finish", timestamp: 123 }],
    });
    const respond = vi.fn();

    await realtimeTranscriptionHandlers["realtimeTranscription.finish"]({
      req: { method: "realtimeTranscription.finish", id: "3" } as never,
      params: { sessionId: "s1" },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(mocks.manager.finishSession).toHaveBeenCalledWith({
      sessionId: "s1",
      reason: undefined,
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        sessionId: "s1",
        closed: true,
        events: [{ type: "session.ended", reason: "client_finish", timestamp: 123 }],
      }),
    );
  });
});
