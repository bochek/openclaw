import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { collectProviderApiKeys } from "../agents/live-auth-keys.js";
import { isLiveTestEnabled } from "../agents/live-test-helpers.js";
import { DEFAULT_LIVE_IMAGE_MODELS } from "../image-generation/live-test-helpers.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { loadShellEnvFallback } from "../infra/shell-env.js";
import { fillPixel, encodePngRgba } from "../media/png-encode.js";
import { getProviderEnvVars } from "../secrets/provider-env-vars.js";
import { DEFAULT_LIVE_VIDEO_MODELS } from "../video-generation/live-test-helpers.js";
import { registerCapabilityCli } from "./capability-cli.js";

type InferSuiteId = "model" | "image" | "audio" | "tts" | "video" | "web" | "embedding";

const LIVE = isLiveTestEnabled();
const INFER_LIVE = isTruthyEnvValue(process.env.OPENCLAW_LIVE_INFER);
const INFER_DEBUG = isTruthyEnvValue(process.env.OPENCLAW_LIVE_INFER_DEBUG);
const REQUIRE_MEDIA_DISCUSS = isTruthyEnvValue(
  process.env.OPENCLAW_LIVE_INFER_REQUIRE_MEDIA_DISCUSS,
);
const describeLive = LIVE && INFER_LIVE ? describe : describe.skip;
const enabledSuites = parseCsvFilter(process.env.OPENCLAW_LIVE_INFER_SUITES);
const tempDirs: string[] = [];

const DEFAULT_TEXT_DISCUSS_MODELS: Record<string, string> = {
  anthropic: "anthropic/claude-sonnet-4-6",
  google: "google/gemini-3.1-pro-preview",
  minimax: "minimax/MiniMax-M1-80k",
  openai: "openai/gpt-5.4",
  xai: "xai/grok-4-fast-reasoning",
  zai: "zai/glm-4.7",
};

const DEFAULT_MEDIA_DISCUSS_MODELS: Record<string, string> = {
  anthropic: "anthropic/claude-sonnet-4-6",
  google: "google/gemini-2.5-flash",
  openai: "openai/gpt-4.1-mini",
};

const DEFAULT_AUDIO_MODELS: Record<string, string> = {
  deepgram: "deepgram/nova-3",
  openai: "openai/gpt-4o-transcribe",
};

const DEFAULT_TTS_MODELS: Record<string, string> = {
  openai: "openai/gpt-4o-mini-tts",
};

const DEFAULT_EMBEDDING_MODELS: Record<string, string> = {
  mistral: "mistral/mistral-embed",
  openai: "openai/text-embedding-3-small",
  voyage: "voyage/voyage-3-large",
};

function parseCsvFilter(raw?: string): Set<string> | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "all") {
    return null;
  }
  const values = trimmed
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return values.length > 0 ? new Set(values) : null;
}

function shouldRunSuite(suite: InferSuiteId): boolean {
  return enabledSuites ? enabledSuites.has(suite) : true;
}

function logStep(step: string, details?: Record<string, unknown>): void {
  if (!INFER_DEBUG) {
    return;
  }
  const suffix = details && Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  console.error(`[live:infer] ${step}${suffix}`);
}

function resolveProviderFilterEnvVar(suite: InferSuiteId): string | undefined {
  return {
    model: process.env.OPENCLAW_LIVE_INFER_MODEL_PROVIDERS,
    image: process.env.OPENCLAW_LIVE_INFER_IMAGE_PROVIDERS,
    audio: process.env.OPENCLAW_LIVE_INFER_AUDIO_PROVIDERS,
    tts: process.env.OPENCLAW_LIVE_INFER_TTS_PROVIDERS,
    video: process.env.OPENCLAW_LIVE_INFER_VIDEO_PROVIDERS,
    web: process.env.OPENCLAW_LIVE_INFER_WEB_PROVIDERS,
    embedding: process.env.OPENCLAW_LIVE_INFER_EMBEDDING_PROVIDERS,
  }[suite];
}

function resolveExplicitModelEnvVar(suite: InferSuiteId): string | undefined {
  return {
    model: process.env.OPENCLAW_LIVE_INFER_MODEL_MODEL,
    image: process.env.OPENCLAW_LIVE_INFER_IMAGE_MODEL,
    audio: process.env.OPENCLAW_LIVE_INFER_AUDIO_MODEL,
    tts: process.env.OPENCLAW_LIVE_INFER_TTS_MODEL,
    video: process.env.OPENCLAW_LIVE_INFER_VIDEO_MODEL,
    web: undefined,
    embedding: process.env.OPENCLAW_LIVE_INFER_EMBEDDING_MODEL,
  }[suite];
}

function resolveTextDiscussModel(): string | undefined {
  const explicit = process.env.OPENCLAW_LIVE_INFER_DISCUSS_MODEL?.trim();
  if (explicit) {
    return explicit;
  }
  return resolvePreferredModel({
    explicitModel: resolveExplicitModelEnvVar("model"),
    providerFilterRaw: resolveProviderFilterEnvVar("model"),
    defaults: DEFAULT_TEXT_DISCUSS_MODELS,
  });
}

function resolveMediaDiscussModel(): string | undefined {
  const explicit =
    process.env.OPENCLAW_LIVE_INFER_MEDIA_DISCUSS_MODEL?.trim() ??
    process.env.OPENCLAW_LIVE_INFER_DISCUSS_MODEL?.trim();
  if (explicit) {
    return explicit;
  }
  return resolvePreferredModel({
    explicitModel: resolveExplicitModelEnvVar("model"),
    providerFilterRaw: resolveProviderFilterEnvVar("model"),
    defaults: DEFAULT_MEDIA_DISCUSS_MODELS,
  });
}

function resolvePreferredModel(params: {
  explicitModel?: string;
  providerFilterRaw?: string;
  defaults: Record<string, string>;
}): string | undefined {
  const explicitModel = params.explicitModel?.trim();
  if (explicitModel) {
    return explicitModel;
  }
  const filter = parseCsvFilter(params.providerFilterRaw);
  for (const [provider, model] of Object.entries(params.defaults)) {
    if (filter && !filter.has(provider)) {
      continue;
    }
    if (collectProviderApiKeys(provider).length > 0) {
      return model;
    }
  }
  return undefined;
}

function maybeLoadShellEnv(): void {
  const providerIds = new Set<string>();
  const addFromModel = (modelRef?: string) => {
    const trimmed = modelRef?.trim();
    if (!trimmed) {
      return;
    }
    const slash = trimmed.indexOf("/");
    if (slash <= 0) {
      return;
    }
    providerIds.add(trimmed.slice(0, slash).trim().toLowerCase());
  };

  addFromModel(resolveTextDiscussModel());
  addFromModel(resolveMediaDiscussModel());
  addFromModel(
    resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("image"),
      providerFilterRaw: resolveProviderFilterEnvVar("image"),
      defaults: DEFAULT_LIVE_IMAGE_MODELS,
    }),
  );
  addFromModel(
    resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("audio"),
      providerFilterRaw: resolveProviderFilterEnvVar("audio"),
      defaults: DEFAULT_AUDIO_MODELS,
    }),
  );
  addFromModel(
    resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("tts"),
      providerFilterRaw: resolveProviderFilterEnvVar("tts"),
      defaults: DEFAULT_TTS_MODELS,
    }),
  );
  addFromModel(
    resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("video"),
      providerFilterRaw: resolveProviderFilterEnvVar("video"),
      defaults: DEFAULT_LIVE_VIDEO_MODELS,
    }),
  );
  addFromModel(
    resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("embedding"),
      providerFilterRaw: resolveProviderFilterEnvVar("embedding"),
      defaults: DEFAULT_EMBEDDING_MODELS,
    }),
  );
  for (const provider of parseCsvFilter(resolveProviderFilterEnvVar("web")) ?? []) {
    providerIds.add(provider);
  }

  const expectedKeys = [
    ...new Set([...providerIds].flatMap((provider) => getProviderEnvVars(provider))),
  ];
  if (expectedKeys.length === 0) {
    return;
  }
  loadShellEnvFallback({
    enabled: true,
    env: process.env,
    expectedKeys,
    logger: { warn: (message: string) => console.warn(message) },
  });
}

maybeLoadShellEnv();

function buildOptionalModelArgs(model?: string): string[] {
  return model?.trim() ? ["--model", model.trim()] : [];
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createReferencePng(): Buffer {
  const width = 192;
  const height = 192;
  const buf = Buffer.alloc(width * height * 4, 255);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      fillPixel(buf, x, y, width, 245, 247, 252, 255);
    }
  }

  for (let y = 28; y < 164; y += 1) {
    for (let x = 28; x < 164; x += 1) {
      fillPixel(buf, x, y, width, 255, 170, 40, 255);
    }
  }

  for (let y = 52; y < 140; y += 1) {
    for (let x = 52; x < 140; x += 1) {
      fillPixel(buf, x, y, width, 36, 41, 46, 255);
    }
  }

  return encodePngRgba(buf, width, height);
}

async function runInferJson(
  argv: string[],
  timeoutMs = 120_000,
): Promise<Record<string, unknown> | Array<unknown>> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = new Command();
  program.exitOverride();
  registerCapabilityCli(program);

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const previousRuntimeLog = process.env.OPENCLAW_TEST_RUNTIME_LOG;
  process.env.OPENCLAW_TEST_RUNTIME_LOG = "1";

  const captureWrite =
    (bucket: string[]) =>
    (
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ) => {
      bucket.push(
        typeof chunk === "string"
          ? chunk
          : Buffer.from(chunk).toString(
              typeof encodingOrCallback === "string" ? encodingOrCallback : undefined,
            ),
      );
      if (typeof encodingOrCallback === "function") {
        encodingOrCallback();
      } else {
        callback?.();
      }
      return true;
    };

  process.stdout.write = captureWrite(stdout) as typeof process.stdout.write;
  process.stderr.write = captureWrite(stderr) as typeof process.stderr.write;

  logStep("command:start", { argv, timeoutMs });
  try {
    const run = program.parseAsync(["infer", ...argv], { from: "user" });
    const result = await Promise.race([
      run,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`infer command timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
    void result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `infer command failed: ${String(error)}`;
    throw new Error(`${message}\nstdout:\n${stdout.join("")}\nstderr:\n${stderr.join("")}`.trim(), {
      cause: error,
    });
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    if (previousRuntimeLog === undefined) {
      delete process.env.OPENCLAW_TEST_RUNTIME_LOG;
    } else {
      process.env.OPENCLAW_TEST_RUNTIME_LOG = previousRuntimeLog;
    }
  }

  const raw = stdout.join("").trim();
  logStep("command:done", { argv, stdoutBytes: raw.length });
  expect(raw.length).toBeGreaterThan(0);
  return JSON.parse(raw) as Record<string, unknown> | Array<unknown>;
}

function isMissingMediaDescriptionError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("no description returned for image") ||
    message.includes("no description returned for video")
  );
}

async function runOptionalMediaDescribe(
  argv: string[],
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  try {
    return (await runInferJson(argv, timeoutMs)) as Record<string, unknown>;
  } catch (error) {
    if (REQUIRE_MEDIA_DISCUSS || !isMissingMediaDescriptionError(error)) {
      throw error;
    }
    logStep("media-describe:skip", {
      argv,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function extractOutputText(result: Record<string, unknown>): string {
  const outputs = Array.isArray(result.outputs)
    ? (result.outputs as Array<Record<string, unknown>>)
    : [];
  return outputs
    .map((entry) => String(entry.text ?? ""))
    .join("\n")
    .trim();
}

function extractFirstOutputPath(result: Record<string, unknown>): string {
  const outputs = Array.isArray(result.outputs)
    ? (result.outputs as Array<Record<string, unknown>>)
    : [];
  const outputPath = outputs.find((entry) => typeof entry.path === "string")?.path;
  expect(typeof outputPath).toBe("string");
  return String(outputPath);
}

async function assertFileExists(filePath: string, minBytes = 1): Promise<void> {
  const stat = await fs.stat(filePath);
  expect(stat.size).toBeGreaterThan(minBytes);
}

async function createTtsSample(tempDir: string): Promise<string> {
  const outputPath = path.join(tempDir, "infer-sample.mp3");
  const ttsModel = resolvePreferredModel({
    explicitModel: resolveExplicitModelEnvVar("tts"),
    providerFilterRaw: resolveProviderFilterEnvVar("tts"),
    defaults: DEFAULT_TTS_MODELS,
  });
  const result = (await runInferJson(
    [
      "tts",
      "convert",
      "--text",
      "OpenClaw infer audio smoke. Please transcribe this sentence.",
      "--output",
      outputPath,
      ...buildOptionalModelArgs(ttsModel),
      "--json",
    ],
    180_000,
  )) as Record<string, unknown>;
  expect(result.capability).toBe("tts.convert");
  const audioPath = extractFirstOutputPath(result);
  await assertFileExists(audioPath, 512);
  return audioPath;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describeLive("infer CLI live", () => {
  it("runs discovery and model discussion smoke", async () => {
    if (!shouldRunSuite("model")) {
      return;
    }

    const list = await runInferJson(["list", "--json"]);
    expect(Array.isArray(list)).toBe(true);
    expect((list as Array<Record<string, unknown>>).some((entry) => entry.id === "model.run")).toBe(
      true,
    );

    const inspect = (await runInferJson([
      "inspect",
      "--name",
      "image.generate",
      "--json",
    ])) as Record<string, unknown>;
    expect(inspect.id).toBe("image.generate");

    const model = resolveExplicitModelEnvVar("model")?.trim() || undefined;
    const nonce = `INFER-LIVE-${randomUUID().slice(0, 8)}`;
    const result = (await runInferJson(
      [
        "model",
        "run",
        "--prompt",
        `Reply with exactly ${nonce}.`,
        ...buildOptionalModelArgs(model),
        "--json",
      ],
      180_000,
    )) as Record<string, unknown>;
    expect(result.capability).toBe("model.run");
    expect(result.ok).toBe(true);
    expect(extractOutputText(result).toUpperCase()).toContain(nonce.toUpperCase());
  }, 240_000);

  it("runs image generate, edit, describe, and providers smoke", async () => {
    if (!shouldRunSuite("image")) {
      return;
    }

    const providers = (await runInferJson(["image", "providers", "--json"])) as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);

    const tempDir = await makeTempDir("openclaw-live-infer-image-");
    const generateOutput = path.join(tempDir, "generated.png");
    const imageModel = resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("image"),
      providerFilterRaw: resolveProviderFilterEnvVar("image"),
      defaults: DEFAULT_LIVE_IMAGE_MODELS,
    });
    const generate = (await runInferJson(
      [
        "image",
        "generate",
        "--prompt",
        "Create a flat orange cat face sticker on a white background.",
        "--output",
        generateOutput,
        ...buildOptionalModelArgs(imageModel),
        "--json",
      ],
      240_000,
    )) as Record<string, unknown>;
    expect(generate.capability).toBe("image.generate");
    const generatedPath = extractFirstOutputPath(generate);
    await assertFileExists(generatedPath, 1_000);

    const referencePath = path.join(tempDir, "reference.png");
    await fs.writeFile(referencePath, createReferencePng());
    const edit = (await runInferJson(
      [
        "image",
        "edit",
        "--file",
        referencePath,
        "--prompt",
        "Change only the background to pale blue and preserve the orange square subject.",
        "--output",
        path.join(tempDir, "edited.png"),
        ...buildOptionalModelArgs(imageModel),
        "--json",
      ],
      240_000,
    )) as Record<string, unknown>;
    expect(edit.capability).toBe("image.edit");
    const editedPath = extractFirstOutputPath(edit);
    await assertFileExists(editedPath, 1_000);

    const describeModel = resolveMediaDiscussModel();
    const describe = await runOptionalMediaDescribe(
      [
        "image",
        "describe",
        "--file",
        editedPath,
        ...buildOptionalModelArgs(describeModel),
        "--json",
      ],
      180_000,
    );
    if (describe) {
      expect(describe.capability).toBe("image.describe");
      expect(extractOutputText(describe).length).toBeGreaterThan(0);
    }
  }, 420_000);

  it("runs audio transcription smoke", async () => {
    if (!shouldRunSuite("audio")) {
      return;
    }

    const providers = (await runInferJson(["audio", "providers", "--json"])) as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);

    const tempDir = await makeTempDir("openclaw-live-infer-audio-");
    const explicitAudioFile = process.env.OPENCLAW_LIVE_INFER_AUDIO_FILE?.trim();
    const audioFile = explicitAudioFile || (await createTtsSample(tempDir));
    const audioModel = resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("audio"),
      providerFilterRaw: resolveProviderFilterEnvVar("audio"),
      defaults: DEFAULT_AUDIO_MODELS,
    });
    const result = (await runInferJson(
      [
        "audio",
        "transcribe",
        "--file",
        audioFile,
        "--prompt",
        "Return a literal transcript.",
        ...buildOptionalModelArgs(audioModel),
        "--json",
      ],
      180_000,
    )) as Record<string, unknown>;
    expect(result.capability).toBe("audio.transcribe");
    const normalizedTranscript = extractOutputText(result).toLowerCase().replace(/\s+/g, "");
    expect(normalizedTranscript).toContain("openclaw");
  }, 300_000);

  it("runs tts convert and provider discovery smoke", async () => {
    if (!shouldRunSuite("tts")) {
      return;
    }

    const providersResult = (await runInferJson(["tts", "providers", "--json"])) as Record<
      string,
      unknown
    >;
    const providers = Array.isArray(providersResult.providers)
      ? (providersResult.providers as Array<Record<string, unknown>>)
      : [];
    expect(providers.length).toBeGreaterThan(0);

    const ttsModel = resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("tts"),
      providerFilterRaw: resolveProviderFilterEnvVar("tts"),
      defaults: DEFAULT_TTS_MODELS,
    });
    const providerFromModel = ttsModel?.split("/", 1)[0];
    if (providerFromModel) {
      const voices = (await runInferJson([
        "tts",
        "voices",
        "--provider",
        providerFromModel,
        "--json",
      ])) as Array<Record<string, unknown>>;
      expect(Array.isArray(voices)).toBe(true);
    }

    const tempDir = await makeTempDir("openclaw-live-infer-tts-");
    const result = (await runInferJson(
      [
        "tts",
        "convert",
        "--text",
        "OpenClaw infer TTS smoke.",
        "--output",
        path.join(tempDir, "tts.mp3"),
        ...buildOptionalModelArgs(ttsModel),
        "--json",
      ],
      180_000,
    )) as Record<string, unknown>;
    expect(result.capability).toBe("tts.convert");
    await assertFileExists(extractFirstOutputPath(result), 512);
  }, 240_000);

  it("runs video generate, describe, and providers smoke", async () => {
    if (!shouldRunSuite("video")) {
      return;
    }

    const providers = (await runInferJson(["video", "providers", "--json"])) as Record<
      string,
      unknown
    >;
    const generationProviders = Array.isArray(providers.generation)
      ? (providers.generation as Array<Record<string, unknown>>)
      : [];
    expect(generationProviders.length).toBeGreaterThan(0);

    const tempDir = await makeTempDir("openclaw-live-infer-video-");
    const videoModel = resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("video"),
      providerFilterRaw: resolveProviderFilterEnvVar("video"),
      defaults: DEFAULT_LIVE_VIDEO_MODELS,
    });
    const generate = (await runInferJson(
      [
        "video",
        "generate",
        "--prompt",
        "Create a five second cinematic sunset over the ocean.",
        "--output",
        path.join(tempDir, "sunset.mp4"),
        ...buildOptionalModelArgs(videoModel),
        "--json",
      ],
      420_000,
    )) as Record<string, unknown>;
    expect(generate.capability).toBe("video.generate");
    const videoPath = extractFirstOutputPath(generate);
    await assertFileExists(videoPath, 1_024);

    const describeModel = resolveMediaDiscussModel();
    const describe = await runOptionalMediaDescribe(
      [
        "video",
        "describe",
        "--file",
        videoPath,
        ...buildOptionalModelArgs(describeModel),
        "--json",
      ],
      240_000,
    );
    if (describe) {
      expect(describe.capability).toBe("video.describe");
      expect(extractOutputText(describe).length).toBeGreaterThan(0);
    }
  }, 720_000);

  it("runs web providers, search, and fetch smoke", async () => {
    if (!shouldRunSuite("web")) {
      return;
    }

    const providers = (await runInferJson(["web", "providers", "--json"])) as Record<
      string,
      unknown
    >;
    expect(Array.isArray(providers.search)).toBe(true);
    expect(Array.isArray(providers.fetch)).toBe(true);

    const webProvider = process.env.OPENCLAW_LIVE_INFER_WEB_PROVIDER?.trim();
    const providerArgs = webProvider ? ["--provider", webProvider] : [];

    const search = (await runInferJson(
      ["web", "search", "--query", "OpenClaw docs", "--limit", "3", ...providerArgs, "--json"],
      180_000,
    )) as Record<string, unknown>;
    expect(search.capability).toBe("web.search");
    expect(JSON.stringify(search.outputs ?? [])).not.toBe("[]");

    const fetch = (await runInferJson(
      ["web", "fetch", "--url", "https://docs.openclaw.ai/cli/infer", "--json"],
      180_000,
    )) as Record<string, unknown>;
    expect(fetch.capability).toBe("web.fetch");
    expect(JSON.stringify(fetch.outputs ?? [])).not.toBe("[]");
  }, 300_000);

  it("runs embedding create and providers smoke", async () => {
    if (!shouldRunSuite("embedding")) {
      return;
    }

    const providers = (await runInferJson(["embedding", "providers", "--json"])) as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);

    const embeddingModel = resolvePreferredModel({
      explicitModel: resolveExplicitModelEnvVar("embedding"),
      providerFilterRaw: resolveProviderFilterEnvVar("embedding"),
      defaults: DEFAULT_EMBEDDING_MODELS,
    });
    const embeddingProvider = embeddingModel?.split("/", 1)[0];
    const providerArgs = embeddingProvider ? ["--provider", embeddingProvider] : [];
    const result = (await runInferJson(
      [
        "embedding",
        "create",
        "--text",
        "openclaw infer live harness",
        "--text",
        "second embedding input",
        ...providerArgs,
        ...buildOptionalModelArgs(embeddingModel),
        "--json",
      ],
      180_000,
    )) as Record<string, unknown>;
    expect(result.capability).toBe("embedding.create");
    const outputs = Array.isArray(result.outputs) ? result.outputs : [];
    expect(outputs).toHaveLength(2);
    expect(
      outputs.every(
        (entry) =>
          typeof (entry as { dimensions?: unknown }).dimensions === "number" &&
          Number((entry as { dimensions: number }).dimensions) > 0,
      ),
    ).toBe(true);
  }, 240_000);
});
