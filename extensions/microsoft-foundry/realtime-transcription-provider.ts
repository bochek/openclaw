import type {
  RealtimeTranscriptionProviderConfig,
  RealtimeTranscriptionProviderPlugin,
  RealtimeTranscriptionSession,
  RealtimeTranscriptionSessionCreateRequest,
} from "openclaw/plugin-sdk/realtime-transcription";
import WebSocket from "ws";
import { normalizeFoundryEndpoint, PROVIDER_ID } from "./shared.js";

type FoundryRealtimeTranscriptionProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  endpoint?: string;
  deployment?: string;
  model?: string;
  apiVersion?: string;
  silenceDurationMs?: number;
  vadThreshold?: number;
};

type FoundryRealtimeTranscriptionSessionConfig = RealtimeTranscriptionSessionCreateRequest & {
  apiKey: string;
  baseUrl: string;
  deployment: string;
  apiVersion: string;
  silenceDurationMs: number;
  vadThreshold: number;
};

type RealtimeEvent = {
  type: string;
  delta?: string;
  transcript?: string;
  error?: unknown;
  item?: { transcript?: string } | null;
};

function trimToUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function extractFoundryProviderConfig(
  rawConfig: RealtimeTranscriptionProviderConfig,
): FoundryRealtimeTranscriptionProviderConfig {
  const providers = asObject(rawConfig.providers);
  const raw =
    asObject(providers?.[PROVIDER_ID]) ??
    asObject(rawConfig[PROVIDER_ID]) ??
    asObject(rawConfig.microsoftFoundry) ??
    asObject(rawConfig);
  const providerBaseUrl = trimToUndefined(raw?.baseUrl);
  const endpoint = trimToUndefined(raw?.endpoint);
  return {
    apiKey:
      trimToUndefined(raw?.apiKey) ??
      trimToUndefined(asObject(raw?.headers)?.["api-key"]) ??
      trimToUndefined(asObject(raw?.headers)?.Authorization)?.replace(/^Bearer\s+/i, ""),
    baseUrl: providerBaseUrl,
    endpoint,
    deployment:
      trimToUndefined(raw?.deployment) ??
      trimToUndefined(raw?.model) ??
      trimToUndefined(raw?.deploymentName),
    model: trimToUndefined(raw?.transcriptionModel) ?? trimToUndefined(raw?.model),
    apiVersion: trimToUndefined(raw?.apiVersion),
    silenceDurationMs: asNumber(raw?.silenceDurationMs),
    vadThreshold: asNumber(raw?.vadThreshold),
  };
}

function resolveFoundryRealtimeBaseUrl(
  config: FoundryRealtimeTranscriptionProviderConfig,
): string | undefined {
  if (config.endpoint) {
    return normalizeFoundryEndpoint(config.endpoint);
  }
  if (!config.baseUrl) {
    return undefined;
  }
  return normalizeFoundryEndpoint(config.baseUrl);
}

class FoundryRealtimeTranscriptionSession implements RealtimeTranscriptionSession {
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly RECONNECT_DELAY_MS = 1000;
  private static readonly CONNECT_TIMEOUT_MS = 10_000;

  private ws: WebSocket | null = null;
  private connected = false;
  private closed = false;
  private reconnectAttempts = 0;
  private pendingTranscript = "";

  constructor(private readonly config: FoundryRealtimeTranscriptionSessionConfig) {}

  async connect(): Promise<void> {
    this.closed = false;
    this.reconnectAttempts = 0;
    await this.doConnect();
  }

  sendAudio(audio: Buffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.sendEvent({
      type: "input_audio_buffer.append",
      audio: audio.toString("base64"),
    });
  }

  close(): void {
    this.closed = true;
    this.connected = false;
    if (this.ws) {
      this.ws.close(1000, "Transcription session closed");
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async doConnect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const wsUrl = this.buildWebSocketUrl();
      this.ws = new WebSocket(wsUrl, {
        headers: {
          "api-key": this.config.apiKey,
        },
      });

      const connectTimeout = setTimeout(() => {
        reject(new Error("Microsoft Foundry realtime transcription connection timeout"));
      }, FoundryRealtimeTranscriptionSession.CONNECT_TIMEOUT_MS);

      this.ws.on("open", () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.sendEvent({
          type: "session.update",
          session: {
            input_audio_format: "pcm16",
            input_audio_transcription: {
              model: this.config.deployment,
            },
            turn_detection: {
              type: "server_vad",
              threshold: this.config.vadThreshold,
              prefix_padding_ms: 300,
              silence_duration_ms: this.config.silenceDurationMs,
            },
          },
        });
        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        try {
          this.handleEvent(JSON.parse(data.toString()) as RealtimeEvent);
        } catch (error) {
          this.config.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      });

      this.ws.on("error", (error) => {
        if (!this.connected) {
          clearTimeout(connectTimeout);
          reject(error);
          return;
        }
        this.config.onError?.(error instanceof Error ? error : new Error(String(error)));
      });

      this.ws.on("close", () => {
        this.connected = false;
        if (this.closed) {
          return;
        }
        void this.attemptReconnect();
      });
    });
  }

  private buildWebSocketUrl(): string {
    const httpBaseUrl = this.config.baseUrl.replace(/\/+$/, "");
    const wsBaseUrl = httpBaseUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
    const url = new URL(`${wsBaseUrl}/openai/realtime`);
    url.searchParams.set("api-version", this.config.apiVersion);
    url.searchParams.set("deployment", this.config.deployment);
    return url.toString();
  }

  private async attemptReconnect(): Promise<void> {
    if (this.closed) {
      return;
    }
    if (this.reconnectAttempts >= FoundryRealtimeTranscriptionSession.MAX_RECONNECT_ATTEMPTS) {
      this.config.onError?.(
        new Error("Microsoft Foundry realtime transcription reconnect limit reached"),
      );
      return;
    }
    this.reconnectAttempts += 1;
    const delay =
      FoundryRealtimeTranscriptionSession.RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempts - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (this.closed) {
      return;
    }
    try {
      await this.doConnect();
    } catch (error) {
      this.config.onError?.(error instanceof Error ? error : new Error(String(error)));
      await this.attemptReconnect();
    }
  }

  private handleEvent(event: RealtimeEvent): void {
    switch (event.type) {
      case "conversation.item.input_audio_transcription.delta":
      case "conversation.item.audio_transcription.delta":
        if (event.delta) {
          this.pendingTranscript += event.delta;
          this.config.onPartial?.(this.pendingTranscript);
        }
        return;

      case "conversation.item.input_audio_transcription.completed":
      case "conversation.item.audio_transcription.completed": {
        const transcript = event.transcript ?? event.item?.transcript;
        if (transcript) {
          this.config.onTranscript?.(transcript);
        }
        this.pendingTranscript = "";
        return;
      }

      case "input_audio_buffer.speech_started":
        this.pendingTranscript = "";
        this.config.onSpeechStart?.();
        return;

      case "error": {
        const detail =
          event.error && typeof event.error === "object" && "message" in event.error
            ? String((event.error as { message?: unknown }).message ?? "Unknown error")
            : event.error
              ? String(event.error)
              : "Unknown error";
        this.config.onError?.(new Error(detail));
        return;
      }

      default:
        return;
    }
  }

  private sendEvent(event: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }
}

export function buildMicrosoftFoundryRealtimeTranscriptionProvider(): RealtimeTranscriptionProviderPlugin {
  return {
    id: PROVIDER_ID,
    label: "Microsoft Foundry Realtime Transcription",
    aliases: ["azure-foundry", "azure-openai-foundry"],
    autoSelectOrder: 20,
    resolveConfig: ({ rawConfig }) => extractFoundryProviderConfig(rawConfig),
    isConfigured: ({ providerConfig }) => {
      const config = extractFoundryProviderConfig(providerConfig);
      return Boolean(config.apiKey && resolveFoundryRealtimeBaseUrl(config) && config.deployment);
    },
    createSession: (req) => {
      const config = extractFoundryProviderConfig(req.providerConfig);
      const baseUrl = resolveFoundryRealtimeBaseUrl(config);
      if (!config.apiKey) {
        throw new Error("Microsoft Foundry realtime transcription API key missing");
      }
      if (!baseUrl) {
        throw new Error("Microsoft Foundry realtime transcription endpoint missing");
      }
      if (!config.deployment) {
        throw new Error("Microsoft Foundry realtime transcription deployment missing");
      }
      return new FoundryRealtimeTranscriptionSession({
        ...req,
        apiKey: config.apiKey,
        baseUrl,
        deployment: config.deployment,
        apiVersion: config.apiVersion ?? "2025-04-01-preview",
        silenceDurationMs: config.silenceDurationMs ?? 800,
        vadThreshold: config.vadThreshold ?? 0.5,
      });
    },
  };
}
