#!/usr/bin/env -S node --import tsx

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { collectProviderApiKeys } from "../src/agents/live-auth-keys.js";
import { formatErrorMessage } from "../src/infra/errors.ts";
import { loadShellEnvFallback } from "../src/infra/shell-env.js";
import { getProviderEnvVars } from "../src/secrets/provider-env-vars.js";

type SpawnPnpmRunner = (params: {
  pnpmArgs: string[];
  stdio: "inherit";
  env: NodeJS.ProcessEnv;
}) => import("node:child_process").ChildProcess;

const require = createRequire(import.meta.url);
const { spawnPnpmRunner } = require("./pnpm-runner.mjs") as {
  spawnPnpmRunner: SpawnPnpmRunner;
};

export type InferSuiteId = "model" | "image" | "audio" | "tts" | "video" | "web" | "embedding";

export type InferSuiteConfig = {
  id: InferSuiteId;
  providerEnvVar: string;
  providers: string[];
};

export const INFER_SUITES: Record<InferSuiteId, InferSuiteConfig> = {
  model: {
    id: "model",
    providerEnvVar: "OPENCLAW_LIVE_INFER_MODEL_PROVIDERS",
    providers: ["anthropic", "google", "minimax", "openai", "xai", "zai"],
  },
  image: {
    id: "image",
    providerEnvVar: "OPENCLAW_LIVE_INFER_IMAGE_PROVIDERS",
    providers: ["fal", "google", "minimax", "openai", "vydra"],
  },
  audio: {
    id: "audio",
    providerEnvVar: "OPENCLAW_LIVE_INFER_AUDIO_PROVIDERS",
    providers: ["deepgram", "google", "groq", "minimax", "mistral", "moonshot", "openai"],
  },
  tts: {
    id: "tts",
    providerEnvVar: "OPENCLAW_LIVE_INFER_TTS_PROVIDERS",
    providers: ["minimax", "openai"],
  },
  video: {
    id: "video",
    providerEnvVar: "OPENCLAW_LIVE_INFER_VIDEO_PROVIDERS",
    providers: [
      "alibaba",
      "byteplus",
      "fal",
      "google",
      "minimax",
      "openai",
      "qwen",
      "runway",
      "together",
      "vydra",
      "xai",
    ],
  },
  web: {
    id: "web",
    providerEnvVar: "OPENCLAW_LIVE_INFER_WEB_PROVIDERS",
    providers: [
      "brave",
      "duckduckgo",
      "exa",
      "google",
      "minimax",
      "ollama",
      "perplexity",
      "tavily",
    ],
  },
  embedding: {
    id: "embedding",
    providerEnvVar: "OPENCLAW_LIVE_INFER_EMBEDDING_PROVIDERS",
    providers: ["mistral", "ollama", "openai", "voyage"],
  },
};

const DEFAULT_SUITES: InferSuiteId[] = [
  "model",
  "image",
  "audio",
  "tts",
  "video",
  "web",
  "embedding",
];
const KEYLESS_PROVIDER_IDS = new Set(["duckduckgo"]);

export type CliOptions = {
  suites: InferSuiteId[];
  globalProviders: Set<string> | null;
  suiteProviders: Partial<Record<InferSuiteId, Set<string>>>;
  requireAuth: boolean;
  quietArgs: string[];
  passthroughArgs: string[];
  help: boolean;
};

export type SuiteRunPlan = {
  suite: InferSuiteConfig;
  providers: string[];
  skippedReason?: string;
};

function parseCsv(raw: string | undefined): Set<string> | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  const values = trimmed
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return values.length > 0 ? new Set(values) : null;
}

function parseSuiteToken(raw: string): InferSuiteId | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized in INFER_SUITES) {
    return normalized as InferSuiteId;
  }
  return null;
}

export function parseArgs(argv: string[]): CliOptions {
  const suites = new Set<InferSuiteId>();
  const suiteProviders: Partial<Record<InferSuiteId, Set<string>>> = {};
  const passthroughArgs: string[] = [];
  const quietArgs: string[] = [];
  let globalProviders: Set<string> | null = null;
  let requireAuth = true;
  let help = false;

  const readValue = (index: number): string => {
    const value = argv[index + 1]?.trim();
    if (!value) {
      throw new Error(`Missing value for ${argv[index]}`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg || arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (
      arg === "--quiet" ||
      arg === "--quiet-live" ||
      arg === "--no-quiet" ||
      arg === "--no-quiet-live"
    ) {
      quietArgs.push(arg);
      continue;
    }
    if (arg === "--providers") {
      globalProviders = parseCsv(readValue(index));
      index += 1;
      continue;
    }
    if (
      arg.startsWith("--") &&
      arg.endsWith("-providers") &&
      arg !== "--providers" &&
      arg !== "--all-providers"
    ) {
      const suite = parseSuiteToken(arg.slice(2, arg.indexOf("-providers")));
      if (!suite) {
        throw new Error(`Unknown suite flag: ${arg}`);
      }
      suiteProviders[suite] = parseCsv(readValue(index)) ?? new Set<string>();
      index += 1;
      continue;
    }
    if (arg === "--with-auth" || arg === "--require-auth") {
      requireAuth = true;
      continue;
    }
    if (arg === "--all-providers" || arg === "--no-auth-filter") {
      requireAuth = false;
      continue;
    }
    if (arg.startsWith("--")) {
      passthroughArgs.push(arg);
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        passthroughArgs.push(next);
        index += 1;
      }
      continue;
    }
    const suite = parseSuiteToken(arg);
    if (suite) {
      suites.add(suite);
      continue;
    }
    if (arg === "all") {
      for (const suiteId of DEFAULT_SUITES) {
        suites.add(suiteId);
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    suites: (suites.size > 0 ? [...suites] : DEFAULT_SUITES).toSorted(),
    globalProviders,
    suiteProviders,
    requireAuth,
    quietArgs,
    passthroughArgs,
    help,
  };
}

function hasUsableLiveAuth(provider: string): boolean {
  return KEYLESS_PROVIDER_IDS.has(provider) || collectProviderApiKeys(provider).length > 0;
}

function selectProviders(params: {
  suite: InferSuiteConfig;
  globalProviders: Set<string> | null;
  suiteProviders: Set<string> | undefined;
  requireAuth: boolean;
}): string[] {
  const explicit = params.suiteProviders ?? params.globalProviders;
  let providers = params.suite.providers.filter((provider) =>
    explicit ? explicit.has(provider) : true,
  );
  if (!params.requireAuth) {
    return providers;
  }
  providers = providers.filter((provider) => hasUsableLiveAuth(provider));
  return providers;
}

export function buildRunPlan(options: CliOptions): SuiteRunPlan[] {
  const expectedKeys = [
    ...new Set(
      options.suites.flatMap((suiteId) =>
        INFER_SUITES[suiteId].providers.flatMap((provider) => getProviderEnvVars(provider)),
      ),
    ),
  ];
  if (expectedKeys.length > 0) {
    loadShellEnvFallback({
      enabled: true,
      env: process.env,
      expectedKeys,
      logger: { warn: (message: string) => console.warn(message) },
    });
  }

  return options.suites.map((suiteId) => {
    const suite = INFER_SUITES[suiteId];
    const providers = selectProviders({
      suite,
      globalProviders: options.globalProviders,
      suiteProviders: options.suiteProviders[suiteId],
      requireAuth: options.requireAuth,
    });
    return {
      suite,
      providers,
      ...(providers.length === 0
        ? {
            skippedReason: options.requireAuth
              ? "no providers with usable auth"
              : "no providers selected",
          }
        : {}),
    };
  });
}

function printHelp(): void {
  console.log(`Infer live harness

Usage:
  pnpm test:live:infer
  pnpm test:live:infer image
  pnpm test:live:infer image video --providers openai,google
  pnpm test:live:infer audio --audio-providers openai,deepgram --all-providers

Defaults:
  - runs model + image + audio + tts + video + web + embedding
  - auto-loads missing provider env vars from ~/.profile
  - narrows each suite to providers that currently have usable auth by default
  - forwards extra args to scripts/test-live.mjs

Flags:
  --providers <csv>             global provider filter
  --model-providers <csv>       model-suite provider filter
  --image-providers <csv>       image-suite provider filter
  --audio-providers <csv>       audio-suite provider filter
  --tts-providers <csv>         tts-suite provider filter
  --video-providers <csv>       video-suite provider filter
  --web-providers <csv>         web-suite provider filter
  --embedding-providers <csv>   embedding-suite provider filter
  --all-providers               do not auto-filter by available auth
  --quiet | --no-quiet          passed through to test:live
`);
}

async function runSuite(params: {
  plan: SuiteRunPlan;
  quietArgs: string[];
  passthroughArgs: string[];
}): Promise<number> {
  const { plan } = params;
  if (!plan.providers.length) {
    console.log(
      `[live:infer] skip ${plan.suite.id}: ${plan.skippedReason ?? "no providers selected"}`,
    );
    return 0;
  }

  const env = {
    ...process.env,
    OPENCLAW_LIVE_INFER: "1",
    OPENCLAW_LIVE_INFER_SUITES: plan.suite.id,
    [plan.suite.providerEnvVar]: plan.providers.join(","),
  };
  const args = [
    "test:live",
    ...params.quietArgs,
    "--",
    "src/cli/capability-cli.live.test.ts",
    ...params.passthroughArgs,
  ];
  console.log(`[live:infer] run ${plan.suite.id}: providers=${plan.providers.join(",") || "auto"}`);

  const child = spawnPnpmRunner({
    pnpmArgs: args,
    stdio: "inherit",
    env,
  });

  return await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal) {
        reject(new Error(`${plan.suite.id} exited via signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

export async function runCli(argv: string[]): Promise<number> {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const plan = buildRunPlan(options);
  const runnable = plan.filter((entry) => entry.providers.length > 0);
  const skipped = plan.filter((entry) => entry.providers.length === 0);

  for (const entry of skipped) {
    console.log(
      `[live:infer] skip ${entry.suite.id}: ${entry.skippedReason ?? "no providers selected"}`,
    );
  }
  if (runnable.length === 0) {
    console.log("[live:infer] nothing to run");
    return 0;
  }

  for (const entry of runnable) {
    const exitCode = await runSuite({
      plan: entry,
      quietArgs: options.quietArgs,
      passthroughArgs: options.passthroughArgs,
    });
    if (exitCode !== 0) {
      return exitCode;
    }
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(formatErrorMessage(error));
      process.exit(1);
    });
}
