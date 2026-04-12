import { rmSync } from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import type { ReplyPayload } from "openclaw/plugin-sdk/reply-payload";
import type { SpeechProviderPlugin, SpeechSynthesisRequest } from "openclaw/plugin-sdk/speech-core";
import { afterEach, describe, expect, it, vi } from "vitest";

type MockSpeechSynthesisResult = Awaited<ReturnType<SpeechProviderPlugin["synthesize"]>>;

const synthesizeMock = vi.hoisted(() =>
  vi.fn(
    async (request: SpeechSynthesisRequest): Promise<MockSpeechSynthesisResult> => ({
      audioBuffer: Buffer.from("voice"),
      fileExtension: ".ogg",
      outputFormat: "ogg",
      voiceCompatible: request.target === "voice-note",
    }),
  ),
);

const listSpeechProvidersMock = vi.hoisted(() => vi.fn());
const getSpeechProviderMock = vi.hoisted(() => vi.fn());

vi.mock("openclaw/plugin-sdk/channel-targets", () => ({
  normalizeChannelId: (channel: string | undefined) => channel?.trim().toLowerCase() ?? null,
}));

vi.mock("../api.js", async () => {
  const actual = await vi.importActual<typeof import("../api.js")>("../api.js");
  const mockProvider: SpeechProviderPlugin = {
    id: "mock",
    label: "Mock",
    autoSelectOrder: 1,
    isConfigured: () => true,
    synthesize: synthesizeMock,
  };
  listSpeechProvidersMock.mockImplementation(() => [mockProvider]);
  getSpeechProviderMock.mockImplementation((providerId: string) =>
    providerId === "mock" ? mockProvider : null,
  );
  return {
    ...actual,
    canonicalizeSpeechProviderId: (providerId: string | undefined) =>
      providerId?.trim().toLowerCase() || undefined,
    normalizeSpeechProviderId: (providerId: string | undefined) =>
      providerId?.trim().toLowerCase() || undefined,
    getSpeechProvider: getSpeechProviderMock,
    listSpeechProviders: listSpeechProvidersMock,
    scheduleCleanup: vi.fn(),
  };
});

const { _test, buildTtsSystemPromptHint, maybeApplyTtsToPayload } = await import("./tts.js");

const nativeVoiceNoteChannels = ["discord", "feishu", "matrix", "telegram", "whatsapp"] as const;

function createTtsConfig(
  prefsName: string,
  overrides?: Partial<NonNullable<OpenClawConfig["messages"]>["tts"]>,
): OpenClawConfig {
  return {
    messages: {
      tts: {
        enabled: true,
        provider: "mock",
        prefsPath: `/tmp/${prefsName}.json`,
        ...overrides,
      },
    },
  };
}

describe("speech-core native voice-note routing", () => {
  afterEach(() => {
    synthesizeMock.mockClear();
  });

  it("keeps native voice-note channel support centralized", () => {
    for (const channel of nativeVoiceNoteChannels) {
      expect(_test.supportsNativeVoiceNoteTts(channel)).toBe(true);
      expect(_test.supportsNativeVoiceNoteTts(channel.toUpperCase())).toBe(true);
    }
    expect(_test.supportsNativeVoiceNoteTts("slack")).toBe(false);
    expect(_test.supportsNativeVoiceNoteTts(undefined)).toBe(false);
  });

  it("marks Discord auto TTS replies as native voice messages", async () => {
    const cfg = createTtsConfig("openclaw-speech-core-tts-test");
    const payload: ReplyPayload = {
      text: "This Discord reply should be delivered as a native voice note.",
    };

    let mediaDir: string | undefined;
    try {
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        channel: "discord",
        kind: "final",
      });

      expect(synthesizeMock).toHaveBeenCalledWith(
        expect.objectContaining({ target: "voice-note" }),
      );
      expect(result.audioAsVoice).toBe(true);
      expect(result.mediaUrl).toMatch(/voice-\d+\.ogg$/);

      mediaDir = result.mediaUrl ? path.dirname(result.mediaUrl) : undefined;
    } finally {
      if (mediaDir) {
        rmSync(mediaDir, { recursive: true, force: true });
      }
    }
  });

  it("keeps non-native voice-note channels as regular audio files", async () => {
    const cfg = createTtsConfig("openclaw-speech-core-tts-slack-test");
    const payload: ReplyPayload = {
      text: "Slack replies should be delivered as regular audio attachments.",
    };

    let mediaDir: string | undefined;
    try {
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        channel: "slack",
        kind: "final",
      });

      expect(synthesizeMock).toHaveBeenCalledWith(
        expect.objectContaining({ target: "audio-file" }),
      );
      expect(result.audioAsVoice).toBeUndefined();
      expect(result.mediaUrl).toMatch(/voice-\d+\.ogg$/);

      mediaDir = result.mediaUrl ? path.dirname(result.mediaUrl) : undefined;
    } finally {
      if (mediaDir) {
        rmSync(mediaDir, { recursive: true, force: true });
      }
    }
  });

  it("supports bare [[tts]] tags in tagged mode by speaking the remaining visible text", async () => {
    const cfg = createTtsConfig("openclaw-speech-core-tts-bare-tag-test", { auto: "tagged" });
    const payload: ReplyPayload = {
      text: "[[tts]] This bare tag should now synthesize from visible text alone.",
    };

    let mediaDir: string | undefined;
    try {
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        channel: "slack",
        kind: "final",
      });

      expect(result.text).toBe("This bare tag should now synthesize from visible text alone.");
      expect(result.mediaUrl).toMatch(/voice-\d+\.ogg$/);
      expect(synthesizeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "This bare tag should now synthesize from visible text alone.",
        }),
      );

      mediaDir = result.mediaUrl ? path.dirname(result.mediaUrl) : undefined;
    } finally {
      if (mediaDir) {
        rmSync(mediaDir, { recursive: true, force: true });
      }
    }
  });

  it("synthesizes directive-only tagged replies into media-only payloads", async () => {
    const cfg = createTtsConfig("openclaw-speech-core-tts-directive-only-test", {
      auto: "tagged",
    });
    const payload: ReplyPayload = {
      text: "[[tts:text]]This tagged reply should be delivered as audio only.[[/tts:text]]",
    };

    let mediaDir: string | undefined;
    try {
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        channel: "slack",
        kind: "final",
      });

      expect(result.text).toBeUndefined();
      expect(result.mediaUrl).toMatch(/voice-\d+\.ogg$/);
      expect(synthesizeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "This tagged reply should be delivered as audio only.",
        }),
      );

      mediaDir = result.mediaUrl ? path.dirname(result.mediaUrl) : undefined;
    } finally {
      if (mediaDir) {
        rmSync(mediaDir, { recursive: true, force: true });
      }
    }
  });

  it("still honors explicit [[tts:text]] blocks when model override directives are disabled", async () => {
    const cfg = createTtsConfig("openclaw-speech-core-tts-directive-text-disabled-overrides", {
      auto: "tagged",
      modelOverrides: { enabled: false },
    });
    const payload: ReplyPayload = {
      text: "[[tts:text]]This explicit spoken text should still synthesize.[[/tts:text]]",
    };

    let mediaDir: string | undefined;
    try {
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        channel: "slack",
        kind: "final",
      });

      expect(result.text).toBeUndefined();
      expect(result.mediaUrl).toMatch(/voice-\d+\.ogg$/);
      expect(synthesizeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "This explicit spoken text should still synthesize.",
        }),
      );

      mediaDir = result.mediaUrl ? path.dirname(result.mediaUrl) : undefined;
    } finally {
      if (mediaDir) {
        rmSync(mediaDir, { recursive: true, force: true });
      }
    }
  });

  it("keeps allowText=false from synthesizing hidden [[tts:text]] content", async () => {
    const cfg = createTtsConfig("openclaw-speech-core-tts-allowtext-disabled", {
      auto: "tagged",
      modelOverrides: { enabled: true, allowText: false },
    });
    const payload: ReplyPayload = {
      text: "[[tts:text]]This hidden text should not synthesize when allowText is false.[[/tts:text]]",
    };

    const result = await maybeApplyTtsToPayload({
      payload,
      cfg,
      channel: "slack",
      kind: "final",
    });

    expect(result).toEqual({ text: undefined });
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("keeps visible text when tagged TTS also includes explicit spoken text", async () => {
    const cfg = createTtsConfig("openclaw-speech-core-tts-visible-text-test", { auto: "tagged" });
    const payload: ReplyPayload = {
      text: "Visible reply text.\n[[tts:text]]Spoken audio content that should still synthesize.[[/tts:text]]",
    };

    let mediaDir: string | undefined;
    try {
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        channel: "slack",
        kind: "final",
      });

      expect(result.text).toBe("Visible reply text.");
      expect(result.mediaUrl).toMatch(/voice-\d+\.ogg$/);
      expect(synthesizeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Spoken audio content that should still synthesize.",
        }),
      );

      mediaDir = result.mediaUrl ? path.dirname(result.mediaUrl) : undefined;
    } finally {
      if (mediaDir) {
        rmSync(mediaDir, { recursive: true, force: true });
      }
    }
  });

  it("advertises the supported bare tag and explicit text block syntax in tagged mode", () => {
    const cfg = createTtsConfig("openclaw-speech-core-tts-hint-test", { auto: "tagged" });

    expect(buildTtsSystemPromptHint(cfg)).toContain(
      "Only use TTS when you either prefix visible text with [[tts]] or wrap spoken-only text as [[tts:text]]your spoken text here[[/tts:text]].",
    );
  });
});
