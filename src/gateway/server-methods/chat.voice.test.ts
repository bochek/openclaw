import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteChatVoiceSession,
  getChatVoiceSession,
  setChatVoiceSession,
} from "../chat-voice-sessions.js";
import { ErrorCodes } from "../protocol/index.js";

const mockState = vi.hoisted(() => ({
  cfg: {
    gateway: {
      controlUi: {
        voice: {
          enabled: true,
          transcriptionProvider: "mock-stt",
          playbackEnabled: true,
        },
      },
    },
    models: {
      providers: {
        "mock-stt": {},
      },
    },
  } as Record<string, unknown>,
  provider: null as {
    id: string;
    isConfigured: ReturnType<typeof vi.fn>;
    createSession: ReturnType<typeof vi.fn>;
  } | null,
}));

vi.mock("../session-utils.js", async () => {
  const original =
    await vi.importActual<typeof import("../session-utils.js")>("../session-utils.js");
  return {
    ...original,
    loadSessionEntry: (rawKey: string) => ({
      cfg: mockState.cfg,
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "sess-voice-1",
        sessionFile: "/tmp/sess-voice-1.jsonl",
      },
      canonicalKey: rawKey || "main",
    }),
  };
});

vi.mock("../../plugin-sdk/realtime-transcription.js", () => ({
  getRealtimeTranscriptionProvider: vi.fn(() => mockState.provider),
}));

const { chatHandlers } = await import("./chat.js");

function createContext() {
  return {
    broadcastToConnIds: vi.fn(),
    logGateway: {
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
}

function createClient(connId = "conn-1") {
  return { connId } as const;
}

afterEach(() => {
  vi.restoreAllMocks();
  deleteChatVoiceSession("main");
  mockState.provider = null;
});

describe("chat voice handlers", () => {
  it("ignores stale onError callbacks from replaced voice sessions", async () => {
    const callbacks: Array<{
      onError?: (error: Error) => void;
    }> = [];
    const sessions = [
      {
        connect: vi.fn(async () => undefined),
        sendAudio: vi.fn(),
        close: vi.fn(),
        isConnected: vi.fn(() => true),
      },
      {
        connect: vi.fn(async () => undefined),
        sendAudio: vi.fn(),
        close: vi.fn(),
        isConnected: vi.fn(() => true),
      },
    ];
    mockState.provider = {
      id: "mock-stt",
      isConfigured: vi.fn(() => true),
      createSession: vi.fn((params) => {
        callbacks.push(params);
        return sessions[callbacks.length - 1];
      }),
    };
    const context = createContext();
    const respond = vi.fn();

    await chatHandlers["chat.voice.start"]({
      params: { sessionKey: "main" },
      respond,
      context: context as never,
      client: createClient(),
    } as never);
    await chatHandlers["chat.voice.start"]({
      params: { sessionKey: "main" },
      respond,
      context: context as never,
      client: createClient(),
    } as never);

    expect(getChatVoiceSession("main")?.sttSession).toBe(sessions[1]);

    callbacks[0].onError?.(new Error("late"));

    expect(getChatVoiceSession("main")?.sttSession).toBe(sessions[1]);
  });

  it("rejects malformed base64 audio before forwarding to the session", async () => {
    const sendAudio = vi.fn();
    setChatVoiceSession({
      sessionKey: "main",
      connId: "conn-1",
      providerId: "mock-stt",
      playbackEnabled: true,
      sttSession: {
        connect: vi.fn(async () => undefined),
        sendAudio,
        close: vi.fn(),
        isConnected: vi.fn(() => true),
      },
      transcriptPartial: "",
      transcriptFinal: "",
      activeRunId: null,
    });
    const respond = vi.fn();

    await chatHandlers["chat.voice.audio"]({
      params: { sessionKey: "main", audio: "not@base64", format: "pcm16" },
      respond,
      client: createClient(),
    } as never);

    expect(sendAudio).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining("base64"),
      }),
    );
  });

  it("preserves buffered transcript when commit send fails", async () => {
    const sttSession = {
      connect: vi.fn(async () => undefined),
      sendAudio: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn(() => true),
    };
    setChatVoiceSession({
      sessionKey: "main",
      connId: "conn-1",
      providerId: "mock-stt",
      playbackEnabled: true,
      sttSession,
      transcriptPartial: "draft tail",
      transcriptFinal: "hello from voice",
      activeRunId: null,
    });
    vi.spyOn(chatHandlers, "chat.send").mockImplementation(async ({ respond }) => {
      respond(false, undefined, { code: ErrorCodes.UNAVAILABLE, message: "send failed" } as never);
    });
    const respond = vi.fn();

    await chatHandlers["chat.voice.commit"]({
      params: { sessionKey: "main" },
      req: {} as never,
      respond,
      context: createContext() as never,
      client: createClient(),
    } as never);

    expect(getChatVoiceSession("main")).toMatchObject({
      transcriptFinal: "hello from voice",
      transcriptPartial: "draft tail",
    });
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: ErrorCodes.UNAVAILABLE }),
    );
  });
});
