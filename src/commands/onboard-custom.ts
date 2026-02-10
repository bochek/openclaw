import type { OpenClawConfig } from "../config/config.js";
import type { ModelProviderConfig } from "../config/types.models.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { DEFAULT_PROVIDER } from "../agents/defaults.js";
import { buildModelAliasIndex, modelKey } from "../agents/model-selection.js";
import { applyPrimaryModel } from "./model-picker.js";
import { normalizeAlias } from "./models/shared.js";

const DEFAULT_OPENAI_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_CONTEXT_WINDOW = 4096;
const DEFAULT_MAX_TOKENS = 4096;
const DISCOVERY_TIMEOUT_MS = 5000;
const VERIFY_TIMEOUT_MS = 10000;

type CustomApiCompatibility = "openai" | "anthropic";
type CustomApiCompatibilityChoice = CustomApiCompatibility | "unknown";
type CustomApiResult = {
  config: OpenClawConfig;
  providerId?: string;
  modelId?: string;
};

const COMPATIBILITY_OPTIONS: Array<{
  value: CustomApiCompatibilityChoice;
  label: string;
  hint: string;
  api?: "openai-completions" | "anthropic-messages";
}> = [
  {
    value: "openai",
    label: "OpenAI-compatible",
    hint: "Uses /models + /chat/completions",
    api: "openai-completions",
  },
  {
    value: "anthropic",
    label: "Anthropic-compatible",
    hint: "Uses /messages",
    api: "anthropic-messages",
  },
  {
    value: "unknown",
    label: "Unknown (detect automatically)",
    hint: "Probes OpenAI then Anthropic endpoints",
  },
];

function resolveBaseUrlDefaults(compatibility: CustomApiCompatibilityChoice) {
  if (compatibility === "anthropic") {
    return {
      initialValue: DEFAULT_ANTHROPIC_BASE_URL,
      placeholder: "https://api.anthropic.com/v1",
    };
  }
  return {
    initialValue: DEFAULT_OPENAI_BASE_URL,
    placeholder: "http://127.0.0.1:11434/v1",
  };
}

function normalizeEndpointId(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildEndpointIdFromUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const port = url.port ? `-${url.port}` : "";
    const candidate = `custom-${host}${port}`;
    return normalizeEndpointId(candidate) || "custom";
  } catch {
    return "custom";
  }
}

function resolveUniqueEndpointId(params: {
  requestedId: string;
  baseUrl: string;
  providers: Record<string, ModelProviderConfig | undefined>;
}) {
  const normalized = normalizeEndpointId(params.requestedId) || "custom";
  const existing = params.providers[normalized];
  if (!existing?.baseUrl || existing.baseUrl === params.baseUrl) {
    return { providerId: normalized, renamed: false };
  }
  let suffix = 2;
  let candidate = `${normalized}-${suffix}`;
  while (params.providers[candidate]) {
    suffix += 1;
    candidate = `${normalized}-${suffix}`;
  }
  return { providerId: candidate, renamed: true };
}

function resolveAliasError(params: {
  raw: string;
  cfg: OpenClawConfig;
  modelRef: string;
}): string | undefined {
  const trimmed = params.raw.trim();
  if (!trimmed) {
    return undefined;
  }
  let normalized: string;
  try {
    normalized = normalizeAlias(trimmed);
  } catch (err) {
    return err instanceof Error ? err.message : "Alias is invalid.";
  }
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
  });
  const aliasKey = normalized.toLowerCase();
  const existing = aliasIndex.byAlias.get(aliasKey);
  if (!existing) {
    return undefined;
  }
  const existingKey = modelKey(existing.ref.provider, existing.ref.model);
  if (existingKey === params.modelRef) {
    return undefined;
  }
  return `Alias ${normalized} already points to ${existingKey}.`;
}

function buildOpenAiHeaders(apiKey: string) {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function buildAnthropicHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseOpenAiModels(data: { data?: { id: string }[]; models?: { id: string }[] }) {
  const rawModels = data.data || data.models || [];
  return rawModels.map((m: unknown) => {
    if (typeof m === "string") {
      return m;
    }
    if (typeof m === "object" && m !== null && "id" in m) {
      return (m as { id: string }).id;
    }
    return String(m);
  });
}

function formatVerificationError(error: unknown): string {
  if (!error) {
    return "unknown error";
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
}

async function tryDiscoverOpenAiModels(params: {
  baseUrl: string;
  apiKey: string;
  prompter: WizardPrompter;
}): Promise<string[] | null> {
  const { baseUrl, apiKey, prompter } = params;
  const spinner = prompter.progress("Connecting...");
  spinner.update(`Scanning models at ${baseUrl}...`);
  try {
    const discoveryUrl = new URL("models", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href;
    const res = await fetchWithTimeout(
      discoveryUrl,
      { headers: buildOpenAiHeaders(apiKey) },
      DISCOVERY_TIMEOUT_MS,
    );
    if (res.ok) {
      const data = (await res.json()) as { data?: { id: string }[]; models?: { id: string }[] };
      const models = parseOpenAiModels(data);
      if (models.length > 0) {
        spinner.stop(`Found ${models.length} models.`);
        return models;
      }
      spinner.stop("Connected, but no models list returned.");
      return [];
    }
    spinner.stop(`Connection succeeded, but discovery failed (${res.status}).`);
    return null;
  } catch {
    spinner.stop("Could not auto-detect models.");
    return null;
  }
}

type VerificationResult = {
  ok: boolean;
  status?: number;
  error?: unknown;
};

async function requestOpenAiVerification(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): Promise<VerificationResult> {
  const endpoint = new URL(
    "chat/completions",
    params.baseUrl.endsWith("/") ? params.baseUrl : `${params.baseUrl}/`,
  ).href;
  try {
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildOpenAiHeaders(params.apiKey),
        },
        body: JSON.stringify({
          model: params.modelId,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
        }),
      },
      VERIFY_TIMEOUT_MS,
    );
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error };
  }
}

async function requestAnthropicVerification(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): Promise<VerificationResult> {
  const endpoint = new URL(
    "messages",
    params.baseUrl.endsWith("/") ? params.baseUrl : `${params.baseUrl}/`,
  ).href;
  try {
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAnthropicHeaders(params.apiKey),
        },
        body: JSON.stringify({
          model: params.modelId,
          max_tokens: 16,
          messages: [{ role: "user", content: "Hi" }],
        }),
      },
      VERIFY_TIMEOUT_MS,
    );
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error };
  }
}

async function promptBaseUrlAndKey(params: {
  prompter: WizardPrompter;
  compatibility: CustomApiCompatibilityChoice;
  initialBaseUrl?: string;
}): Promise<{ baseUrl: string; apiKey: string }> {
  const defaults = resolveBaseUrlDefaults(params.compatibility);
  const baseUrlInput = await params.prompter.text({
    message: "API Base URL",
    initialValue: params.initialBaseUrl ?? defaults.initialValue,
    placeholder: defaults.placeholder,
    validate: (val) => {
      try {
        new URL(val);
        return undefined;
      } catch {
        return "Please enter a valid URL (e.g. http://...)";
      }
    },
  });
  const apiKeyInput = await params.prompter.text({
    message: "API Key (optional)",
    placeholder: "sk-...",
    initialValue: "",
  });
  return { baseUrl: baseUrlInput.trim(), apiKey: apiKeyInput.trim() };
}

export async function promptCustomApiConfig(params: {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  config: OpenClawConfig;
}): Promise<CustomApiResult> {
  const { prompter, runtime, config } = params;

  const compatibilityChoice = await prompter.select({
    message: "Endpoint compatibility",
    options: COMPATIBILITY_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      hint: option.hint,
    })),
  });
  let compatibility: CustomApiCompatibility | null =
    compatibilityChoice === "unknown" ? null : compatibilityChoice;
  let providerApi =
    COMPATIBILITY_OPTIONS.find((entry) => entry.value === compatibility)?.api ??
    "openai-completions";
  let baseUrl = "";
  let apiKey = "";
  let modelId: string | undefined;
  let discoveredModels: string[] | null = null;
  let verifiedFromProbe = false;

  if (compatibilityChoice === "unknown") {
    let lastBaseUrl: string | undefined;
    while (!compatibility) {
      const baseInput = await promptBaseUrlAndKey({
        prompter,
        compatibility: compatibilityChoice,
        initialBaseUrl: lastBaseUrl,
      });
      baseUrl = baseInput.baseUrl;
      apiKey = baseInput.apiKey;

      const models = await tryDiscoverOpenAiModels({ baseUrl, apiKey, prompter });
      if (models && models.length > 0) {
        compatibility = "openai";
        providerApi = "openai-completions";
        discoveredModels = models;
        break;
      }

      modelId = (
        await prompter.text({
          message: "Model ID",
          placeholder: "e.g. llama3, claude-3-7-sonnet",
          validate: (val) => (val.trim() ? undefined : "Model ID is required"),
        })
      ).trim();

      const probeSpinner = prompter.progress("Detecting endpoint type...");
      const openaiProbe = await requestOpenAiVerification({ baseUrl, apiKey, modelId });
      if (openaiProbe.ok) {
        probeSpinner.stop("Detected OpenAI-compatible endpoint.");
        compatibility = "openai";
        providerApi = "openai-completions";
        verifiedFromProbe = true;
        break;
      }

      const anthropicProbe = await requestAnthropicVerification({ baseUrl, apiKey, modelId });
      if (anthropicProbe.ok) {
        probeSpinner.stop("Detected Anthropic-compatible endpoint.");
        compatibility = "anthropic";
        providerApi = "anthropic-messages";
        verifiedFromProbe = true;
        break;
      }

      probeSpinner.stop("Could not detect endpoint type.");
      await prompter.note(
        "This endpoint did not respond to OpenAI or Anthropic style requests. Enter a new base URL and try again.",
        "Endpoint detection",
      );
      lastBaseUrl = baseUrl;
      modelId = undefined;
    }
  } else {
    const baseInput = await promptBaseUrlAndKey({
      prompter,
      compatibility: compatibilityChoice,
    });
    baseUrl = baseInput.baseUrl;
    apiKey = baseInput.apiKey;
    compatibility = compatibilityChoice;
    providerApi =
      COMPATIBILITY_OPTIONS.find((entry) => entry.value === compatibility)?.api ??
      "openai-completions";
  }

  if (!compatibility) {
    return { config };
  }

  const providers = config.models?.providers ?? {};
  const suggestedId = buildEndpointIdFromUrl(baseUrl);
  const providerIdInput = await prompter.text({
    message: "Endpoint ID",
    initialValue: suggestedId,
    placeholder: "custom",
    validate: (value) => {
      const normalized = normalizeEndpointId(value);
      if (!normalized) {
        return "Endpoint ID is required.";
      }
      return undefined;
    },
  });
  const providerIdResult = resolveUniqueEndpointId({
    requestedId: providerIdInput,
    baseUrl,
    providers,
  });
  if (providerIdResult.renamed) {
    await prompter.note(
      `Endpoint ID "${providerIdInput}" already exists for a different base URL. Using "${providerIdResult.providerId}".`,
      "Endpoint ID",
    );
  }
  const providerId = providerIdResult.providerId;

  if (compatibility === "openai" && !discoveredModels) {
    discoveredModels = await tryDiscoverOpenAiModels({ baseUrl, apiKey, prompter });
  }

  if (!modelId) {
    if (compatibility === "openai" && discoveredModels && discoveredModels.length > 0) {
      const selection = await prompter.select({
        message: "Select a model",
        options: [
          ...discoveredModels.map((id) => ({ value: id, label: id })),
          { value: "__manual", label: "(Enter manually...)" },
        ],
      });
      if (selection !== "__manual") {
        modelId = selection;
      }
    } else if (compatibility === "anthropic") {
      await prompter.note(
        "Anthropic-compatible endpoints do not expose a standard models endpoint. Please enter a model ID manually.",
        "Model discovery",
      );
    }
  }

  if (!modelId) {
    modelId = (
      await prompter.text({
        message: "Model ID",
        placeholder: "e.g. llama3, claude-3-7-sonnet",
        validate: (val) => (val.trim() ? undefined : "Model ID is required"),
      })
    ).trim();
  }

  const modelRef = modelKey(providerId, modelId);
  const aliasInput = await prompter.text({
    message: "Model alias (optional)",
    placeholder: "e.g. local, ollama",
    initialValue: "",
    validate: (value) => resolveAliasError({ raw: value, cfg: config, modelRef }),
  });
  const alias = aliasInput.trim();

  let verified = verifiedFromProbe;
  if (!verified) {
    const verifySpinner = prompter.progress("Verifying...");
    const result =
      compatibility === "anthropic"
        ? await requestAnthropicVerification({ baseUrl, apiKey, modelId })
        : await requestOpenAiVerification({ baseUrl, apiKey, modelId });
    if (result.ok) {
      verified = true;
      verifySpinner.stop("Verification successful.");
    } else if (result.status !== undefined) {
      verifySpinner.stop(`Verification failed: status ${result.status}`);
    } else {
      verifySpinner.stop(`Verification failed: ${formatVerificationError(result.error)}`);
    }
  }

  if (!verified) {
    const confirm = await prompter.confirm({
      message: "Could not verify model connection. Save anyway?",
      initialValue: true,
    });
    if (!confirm) {
      return { config };
    }
  }

  const existingProvider = providers[providerId];
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const hasModel = existingModels.some((model) => model.id === modelId);
  const nextModel = {
    id: modelId,
    name: `${modelId} (Custom API)`,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    input: ["text"] as ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
  };
  const mergedModels = hasModel ? existingModels : [...existingModels, nextModel];
  const { apiKey: existingApiKey, ...existingProviderRest } = existingProvider ?? {};
  const normalizedApiKey = apiKey.trim() || (existingApiKey ? existingApiKey.trim() : undefined);

  let newConfig: OpenClawConfig = {
    ...config,
    models: {
      ...config.models,
      mode: config.models?.mode ?? "merge",
      providers: {
        ...providers,
        [providerId]: {
          ...existingProviderRest,
          baseUrl,
          api: providerApi,
          ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
          models: mergedModels.length > 0 ? mergedModels : [nextModel],
        },
      },
    },
  };

  newConfig = applyPrimaryModel(newConfig, modelRef);
  if (alias) {
    newConfig = {
      ...newConfig,
      agents: {
        ...newConfig.agents,
        defaults: {
          ...newConfig.agents?.defaults,
          models: {
            ...newConfig.agents?.defaults?.models,
            [modelRef]: {
              ...newConfig.agents?.defaults?.models?.[modelRef],
              alias,
            },
          },
        },
      },
    };
  }

  runtime.log(`Configured custom provider: ${providerId}/${modelId}`);
  return { config: newConfig, providerId, modelId };
}
