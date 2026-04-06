/**
 * Browser-native speech services: STT via SpeechRecognition, TTS via SpeechSynthesis.
 * Falls back gracefully when APIs are unavailable.
 */

// ─── STT (Speech-to-Text) ───

type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
  resultIndex: number;
};

type SpeechRecognitionErrorEvent = Event & {
  error: string;
  message?: string;
};

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = globalThis as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

export function isSttSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export type SttCallbacks = {
  onTranscript: (text: string, isFinal: boolean) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
};

let activeRecognition: SpeechRecognitionInstance | null = null;

export function startStt(callbacks: SttCallbacks): boolean {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    callbacks.onError?.("Speech recognition is not supported in this browser");
    return false;
  }

  stopStt();

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.addEventListener("start", () => callbacks.onStart?.());

  recognition.addEventListener("result", (event) => {
    const speechEvent = event as unknown as SpeechRecognitionEvent;
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = speechEvent.resultIndex; i < speechEvent.results.length; i++) {
      const result = speechEvent.results[i];
      if (!result?.[0]) {
        continue;
      }
      const transcript = result[0].transcript;
      if (result.isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript) {
      callbacks.onTranscript(finalTranscript, true);
    } else if (interimTranscript) {
      callbacks.onTranscript(interimTranscript, false);
    }
  });

  recognition.addEventListener("error", (event) => {
    const speechEvent = event as unknown as SpeechRecognitionErrorEvent;
    if (speechEvent.error === "aborted" || speechEvent.error === "no-speech") {
      return;
    }
    callbacks.onError?.(speechEvent.error);
  });

  recognition.addEventListener("end", () => {
    if (activeRecognition === recognition) {
      activeRecognition = null;
    }
    callbacks.onEnd?.();
  });

  activeRecognition = recognition;
  recognition.start();
  return true;
}

export function stopStt(): void {
  if (activeRecognition) {
    const r = activeRecognition;
    activeRecognition = null;
    try {
      r.stop();
    } catch {
      // already stopped
    }
  }
}

export function isSttActive(): boolean {
  return activeRecognition !== null;
}

// ─── Realtime Voice Capture ───

type RealtimeVoiceCallbacks = {
  onChunk: (chunkBase64: string) => void;
  onStart?: () => void;
  onStop?: () => void;
  onError?: (error: string) => void;
};

type RealtimeVoiceCapture = {
  stop: () => void;
};

const REALTIME_VOICE_TARGET_SAMPLE_RATE = 16_000;
const REALTIME_VOICE_CHUNK_MS = 250;

let activeRealtimeVoiceCapture: RealtimeVoiceCapture | null = null;

export function isRealtimeVoiceSupported(): boolean {
  const hasGetUserMedia =
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
  return (
    typeof window !== "undefined" &&
    Boolean(window.isSecureContext) &&
    hasGetUserMedia &&
    typeof AudioContext !== "undefined"
  );
}

export async function startRealtimeVoiceCapture(
  callbacks: RealtimeVoiceCallbacks,
): Promise<boolean> {
  if (!isRealtimeVoiceSupported()) {
    callbacks.onError?.("Realtime voice requires a secure context with microphone access");
    return false;
  }

  stopRealtimeVoiceCapture();

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error.message : String(error));
    return false;
  }

  const audioContext = new AudioContext();
  try {
    if (audioContext.state !== "running") {
      await audioContext.resume();
    }
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    callbacks.onError?.(
      error instanceof Error ? error.message : "Failed to start realtime voice capture",
    );
    void audioContext.close();
    return false;
  }

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const samplesPerChunk = Math.max(
    1,
    Math.round((REALTIME_VOICE_TARGET_SAMPLE_RATE * REALTIME_VOICE_CHUNK_MS) / 1000),
  );
  let pcmBuffer = new Int16Array(0);
  let stopped = false;

  const flushChunk = () => {
    if (pcmBuffer.length < samplesPerChunk) {
      return;
    }
    const chunk = pcmBuffer.slice(0, samplesPerChunk);
    pcmBuffer = pcmBuffer.slice(samplesPerChunk);
    callbacks.onChunk(encodePcm16Chunk(chunk));
  };

  processor.onaudioprocess = (event) => {
    if (stopped) {
      return;
    }
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleFloat32Buffer(
      input,
      audioContext.sampleRate,
      REALTIME_VOICE_TARGET_SAMPLE_RATE,
    );
    if (downsampled.length === 0) {
      return;
    }
    const next = new Int16Array(pcmBuffer.length + downsampled.length);
    next.set(pcmBuffer, 0);
    next.set(downsampled, pcmBuffer.length);
    pcmBuffer = next;
    flushChunk();
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    activeRealtimeVoiceCapture = null;
    if (pcmBuffer.length > 0) {
      callbacks.onChunk(encodePcm16Chunk(pcmBuffer));
      pcmBuffer = new Int16Array(0);
    }
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void audioContext.close();
    callbacks.onStop?.();
  };

  activeRealtimeVoiceCapture = { stop };
  callbacks.onStart?.();
  return true;
}

export function stopRealtimeVoiceCapture(): void {
  activeRealtimeVoiceCapture?.stop();
}

function downsampleFloat32Buffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
): Int16Array {
  if (outputSampleRate >= inputSampleRate) {
    return float32ToPcm16(buffer);
  }
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.round(buffer.length / ratio));
  const output = new Int16Array(outputLength);
  let offsetBuffer = 0;
  for (let i = 0; i < outputLength; i += 1) {
    const nextOffsetBuffer = Math.min(buffer.length, Math.round((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = offsetBuffer; j < nextOffsetBuffer; j += 1) {
      sum += buffer[j];
      count += 1;
    }
    const sample = count > 0 ? sum / count : 0;
    output[i] = float32SampleToPcm16(sample);
    offsetBuffer = nextOffsetBuffer;
  }
  return output;
}

function float32ToPcm16(buffer: Float32Array): Int16Array {
  const output = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    output[i] = float32SampleToPcm16(buffer[i]);
  }
  return output;
}

function float32SampleToPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}

function encodePcm16Chunk(chunk: Int16Array): string {
  const bytes = new Uint8Array(chunk.length * 2);
  for (let i = 0; i < chunk.length; i += 1) {
    const value = chunk[i];
    bytes[i * 2] = value & 0xff;
    bytes[i * 2 + 1] = (value >> 8) & 0xff;
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// ─── TTS (Text-to-Speech) ───

export function isTtsSupported(): boolean {
  return "speechSynthesis" in globalThis;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speakText(
  text: string,
  opts?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
  },
): boolean {
  if (!isTtsSupported()) {
    opts?.onError?.("Speech synthesis is not supported in this browser");
    return false;
  }

  stopTts();

  const cleaned = stripMarkdown(text);
  if (!cleaned.trim()) {
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  utterance.addEventListener("start", () => opts?.onStart?.());
  utterance.addEventListener("end", () => {
    if (currentUtterance === utterance) {
      currentUtterance = null;
    }
    opts?.onEnd?.();
  });
  utterance.addEventListener("error", (e) => {
    if (currentUtterance === utterance) {
      currentUtterance = null;
    }
    if (e.error === "canceled" || e.error === "interrupted") {
      return;
    }
    opts?.onError?.(e.error);
  });

  currentUtterance = utterance;
  speechSynthesis.speak(utterance);
  return true;
}

export function stopTts(): void {
  if (currentUtterance) {
    currentUtterance = null;
  }
  if (isTtsSupported()) {
    speechSynthesis.cancel();
  }
}

export function isTtsSpeaking(): boolean {
  return isTtsSupported() && speechSynthesis.speaking;
}

/** Strip common markdown syntax for cleaner speech output. */
function stripMarkdown(text: string): string {
  return (
    text
      // code blocks
      .replace(/```[\s\S]*?```/g, "")
      // inline code
      .replace(/`[^`]+`/g, "")
      // images
      .replace(/!\[.*?\]\(.*?\)/g, "")
      // links → keep text
      .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
      // headings
      .replace(/^#{1,6}\s+/gm, "")
      // bold/italic
      .replace(/\*{1,3}(.*?)\*{1,3}/g, "$1")
      .replace(/_{1,3}(.*?)_{1,3}/g, "$1")
      // blockquotes
      .replace(/^>\s?/gm, "")
      // horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, "")
      // list markers
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      // HTML tags
      .replace(/<[^>]+>/g, "")
      // collapse whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
