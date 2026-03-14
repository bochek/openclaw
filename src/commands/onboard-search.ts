import { isCodexNativeWebSearchModel } from "../agents/codex-native-web-search.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  DEFAULT_SECRET_PROVIDER_ALIAS,
  type SecretInput,
  type SecretRef,
  hasConfiguredSecretInput,
  normalizeSecretInputString,
} from "../config/types.secrets.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { AuthChoice, SecretInputMode } from "./onboard-types.js";

export type SearchProvider = "brave" | "gemini" | "grok" | "kimi" | "perplexity";
export type InteractiveSearchMode = "configured-provider" | "native-codex";

type SearchProviderEntry = {
  value: SearchProvider;
  label: string;
  hint: string;
  envKeys: string[];
  placeholder: string;
  signupUrl: string;
};

export const SEARCH_PROVIDER_OPTIONS: readonly SearchProviderEntry[] = [
  {
    value: "brave",
    label: "Brave Search",
    hint: "Structured results · country/language/time filters",
    envKeys: ["BRAVE_API_KEY"],
    placeholder: "BSA...",
    signupUrl: "https://brave.com/search/api/",
  },
  {
    value: "gemini",
    label: "Gemini (Google Search)",
    hint: "Google Search grounding · AI-synthesized",
    envKeys: ["GEMINI_API_KEY"],
    placeholder: "AIza...",
    signupUrl: "https://aistudio.google.com/apikey",
  },
  {
    value: "grok",
    label: "Grok (xAI)",
    hint: "xAI web-grounded responses",
    envKeys: ["XAI_API_KEY"],
    placeholder: "xai-...",
    signupUrl: "https://console.x.ai/",
  },
  {
    value: "kimi",
    label: "Kimi (Moonshot)",
    hint: "Moonshot web search",
    envKeys: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
    placeholder: "sk-...",
    signupUrl: "https://platform.moonshot.cn/",
  },
  {
    value: "perplexity",
    label: "Perplexity Search",
    hint: "Structured results · domain/country/language/time filters",
    envKeys: ["PERPLEXITY_API_KEY"],
    placeholder: "pplx-...",
    signupUrl: "https://www.perplexity.ai/settings/api",
  },
] as const;

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveDefaultModelRef(config: OpenClawConfig): string | undefined {
  const modelConfig = config.agents?.defaults?.model;
  if (typeof modelConfig === "string") {
    return trimOptionalString(modelConfig);
  }
  return trimOptionalString(modelConfig?.primary);
}

function resolveConfiguredModelContext(config: OpenClawConfig): {
  modelProvider?: string;
  modelApi?: string;
} {
  const modelRef = resolveDefaultModelRef(config);
  if (!modelRef) {
    return {};
  }

  const slashIndex = modelRef.indexOf("/");
  const modelProvider =
    slashIndex > 0 ? trimOptionalString(modelRef.slice(0, slashIndex)) : undefined;
  if (!modelProvider) {
    return {};
  }

  const providerConfig = config.models?.providers?.[modelProvider];
  const modelApi = trimOptionalString(providerConfig?.api);
  return {
    modelProvider,
    modelApi,
  };
}

export function shouldOfferNativeCodexSearch(
  config: OpenClawConfig,
  params?: { authChoice?: AuthChoice },
): boolean {
  if (params?.authChoice === "openai-codex") {
    return true;
  }
  return isCodexNativeWebSearchModel(resolveConfiguredModelContext(config));
}

function applyCodexSearchStrategy(
  config: OpenClawConfig,
  params: {
    strategy: "openclaw" | "native";
    mode?: "disabled" | "cached" | "live";
    enabled?: boolean;
  },
): OpenClawConfig {
  const previousSearch = config.tools?.web?.search;
  return {
    ...config,
    tools: {
      ...config.tools,
      web: {
        ...config.tools?.web,
        search: {
          ...previousSearch,
          ...(params.enabled === undefined ? {} : { enabled: params.enabled }),
          openaiCodex: {
            ...previousSearch?.openaiCodex,
            strategy: params.strategy,
            ...(params.strategy === "native" && params.mode ? { mode: params.mode } : {}),
          },
        },
      },
    },
  };
}

export function applyConfiguredProviderSearchStrategy(config: OpenClawConfig): OpenClawConfig {
  return applyCodexSearchStrategy(config, {
    strategy: "openclaw",
    enabled: true,
  });
}

export function applyNativeCodexSearchConfig(
  config: OpenClawConfig,
  mode: "disabled" | "cached" | "live",
): OpenClawConfig {
  return applyCodexSearchStrategy(config, {
    strategy: "native",
    mode,
    enabled: true,
  });
}

export function hasKeyInEnv(entry: SearchProviderEntry): boolean {
  return entry.envKeys.some((k) => Boolean(process.env[k]?.trim()));
}

function rawKeyValue(config: OpenClawConfig, provider: SearchProvider): unknown {
  const search = config.tools?.web?.search;
  switch (provider) {
    case "brave":
      return search?.apiKey;
    case "gemini":
      return search?.gemini?.apiKey;
    case "grok":
      return search?.grok?.apiKey;
    case "kimi":
      return search?.kimi?.apiKey;
    case "perplexity":
      return search?.perplexity?.apiKey;
  }
}

/** Returns the plaintext key string, or undefined for SecretRefs/missing. */
export function resolveExistingKey(
  config: OpenClawConfig,
  provider: SearchProvider,
): string | undefined {
  return normalizeSecretInputString(rawKeyValue(config, provider));
}

/** Returns true if a key is configured (plaintext string or SecretRef). */
export function hasExistingKey(config: OpenClawConfig, provider: SearchProvider): boolean {
  return hasConfiguredSecretInput(rawKeyValue(config, provider));
}

/** Build an env-backed SecretRef for a search provider. */
function buildSearchEnvRef(provider: SearchProvider): SecretRef {
  const entry = SEARCH_PROVIDER_OPTIONS.find((e) => e.value === provider);
  const envVar = entry?.envKeys.find((k) => Boolean(process.env[k]?.trim())) ?? entry?.envKeys[0];
  if (!envVar) {
    throw new Error(
      `No env var mapping for search provider "${provider}" in secret-input-mode=ref.`,
    );
  }
  return { source: "env", provider: DEFAULT_SECRET_PROVIDER_ALIAS, id: envVar };
}

/** Resolve a plaintext key into the appropriate SecretInput based on mode. */
function resolveSearchSecretInput(
  provider: SearchProvider,
  key: string,
  secretInputMode?: SecretInputMode,
): SecretInput {
  const useSecretRefMode = secretInputMode === "ref"; // pragma: allowlist secret
  if (useSecretRefMode) {
    return buildSearchEnvRef(provider);
  }
  return key;
}

export function applySearchKey(
  config: OpenClawConfig,
  provider: SearchProvider,
  key: SecretInput,
): OpenClawConfig {
  const search = {
    ...config.tools?.web?.search,
    provider,
    enabled: true,
    openaiCodex: {
      ...config.tools?.web?.search?.openaiCodex,
      strategy: "openclaw" as const,
    },
  };
  switch (provider) {
    case "brave":
      search.apiKey = key;
      break;
    case "gemini":
      search.gemini = { ...search.gemini, apiKey: key };
      break;
    case "grok":
      search.grok = { ...search.grok, apiKey: key };
      break;
    case "kimi":
      search.kimi = { ...search.kimi, apiKey: key };
      break;
    case "perplexity":
      search.perplexity = { ...search.perplexity, apiKey: key };
      break;
  }
  return {
    ...config,
    tools: {
      ...config.tools,
      web: { ...config.tools?.web, search },
    },
  };
}

function applyProviderOnly(config: OpenClawConfig, provider: SearchProvider): OpenClawConfig {
  return {
    ...config,
    tools: {
      ...config.tools,
      web: {
        ...config.tools?.web,
        search: {
          ...config.tools?.web?.search,
          provider,
          enabled: true,
          openaiCodex: {
            ...config.tools?.web?.search?.openaiCodex,
            strategy: "openclaw",
          },
        },
      },
    },
  };
}

function preserveDisabledState(original: OpenClawConfig, result: OpenClawConfig): OpenClawConfig {
  if (original.tools?.web?.search?.enabled !== false) {
    return result;
  }
  return {
    ...result,
    tools: {
      ...result.tools,
      web: { ...result.tools?.web, search: { ...result.tools?.web?.search, enabled: false } },
    },
  };
}

async function setupConfiguredProviderSearch(
  config: OpenClawConfig,
  prompter: WizardPrompter,
  opts?: SetupSearchOptions,
): Promise<OpenClawConfig> {
  const existingProvider = config.tools?.web?.search?.provider;

  const options = SEARCH_PROVIDER_OPTIONS.map((entry) => {
    const configured = hasExistingKey(config, entry.value) || hasKeyInEnv(entry);
    const hint = configured ? `${entry.hint} · configured` : entry.hint;
    return { value: entry.value, label: entry.label, hint };
  });

  const defaultProvider: SearchProvider = (() => {
    if (existingProvider && SEARCH_PROVIDER_OPTIONS.some((e) => e.value === existingProvider)) {
      return existingProvider;
    }
    const detected = SEARCH_PROVIDER_OPTIONS.find(
      (e) => hasExistingKey(config, e.value) || hasKeyInEnv(e),
    );
    if (detected) {
      return detected.value;
    }
    return SEARCH_PROVIDER_OPTIONS[0].value;
  })();

  type PickerValue = SearchProvider | "__skip__";
  const choice = await prompter.select<PickerValue>({
    message: "Search provider",
    options: [
      ...options,
      {
        value: "__skip__" as const,
        label: "Skip for now",
        hint: "Configure later with openclaw configure --section web",
      },
    ],
    initialValue: defaultProvider as PickerValue,
  });

  if (choice === "__skip__") {
    return config;
  }

  const entry = SEARCH_PROVIDER_OPTIONS.find((e) => e.value === choice)!;
  const existingKey = resolveExistingKey(config, choice);
  const keyConfigured = hasExistingKey(config, choice);
  const envAvailable = hasKeyInEnv(entry);

  if (opts?.quickstartDefaults && (keyConfigured || envAvailable)) {
    const result = existingKey
      ? applySearchKey(config, choice, existingKey)
      : applyProviderOnly(config, choice);
    return preserveDisabledState(config, result);
  }

  const useSecretRefMode = opts?.secretInputMode === "ref"; // pragma: allowlist secret
  if (useSecretRefMode) {
    if (keyConfigured) {
      return preserveDisabledState(config, applyProviderOnly(config, choice));
    }
    const ref = buildSearchEnvRef(choice);
    await prompter.note(
      [
        "Secret references enabled — OpenClaw will store a reference instead of the API key.",
        `Env var: ${ref.id}${envAvailable ? " (detected)" : ""}.`,
        ...(envAvailable ? [] : [`Set ${ref.id} in the Gateway environment.`]),
        "Docs: https://docs.openclaw.ai/tools/web",
      ].join("\n"),
      "Web search",
    );
    return applySearchKey(config, choice, ref);
  }

  const keyInput = await prompter.text({
    message: keyConfigured
      ? `${entry.label} API key (leave blank to keep current)`
      : envAvailable
        ? `${entry.label} API key (leave blank to use env var)`
        : `${entry.label} API key`,
    placeholder: keyConfigured ? "Leave blank to keep current" : entry.placeholder,
  });

  const key = keyInput?.trim() ?? "";
  if (key) {
    const secretInput = resolveSearchSecretInput(choice, key, opts?.secretInputMode);
    return applySearchKey(config, choice, secretInput);
  }

  if (existingKey) {
    return preserveDisabledState(config, applySearchKey(config, choice, existingKey));
  }

  if (keyConfigured || envAvailable) {
    return preserveDisabledState(config, applyProviderOnly(config, choice));
  }

  await prompter.note(
    [
      "No API key stored — search with a configured provider won't work until a key is available.",
      `Get your key at: ${entry.signupUrl}`,
      "Docs: https://docs.openclaw.ai/tools/web",
    ].join("\n"),
    "Web search",
  );

  return {
    ...config,
    tools: {
      ...config.tools,
      web: {
        ...config.tools?.web,
        search: {
          ...config.tools?.web?.search,
          provider: choice,
          openaiCodex: {
            ...config.tools?.web?.search?.openaiCodex,
            strategy: "openclaw",
          },
        },
      },
    },
  };
}

async function promptCodexSearchMode(
  config: OpenClawConfig,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  const existingMode = config.tools?.web?.search?.openaiCodex?.mode;
  const choice = await prompter.select<"cached" | "live" | "disabled">({
    message: "Native Codex search mode",
    options: [
      {
        value: "cached",
        label: "cached (recommended)",
        hint: "Use Codex native search without live external web access",
      },
      {
        value: "live",
        label: "live",
        hint: "Allow live external web access for native Codex search",
      },
      {
        value: "disabled",
        label: "disabled",
        hint: "Disable all search for eligible Codex runs",
      },
    ],
    initialValue: existingMode === "disabled" || existingMode === "live" ? existingMode : "cached",
  });
  return applyNativeCodexSearchConfig(config, choice);
}

export type SetupSearchOptions = {
  quickstartDefaults?: boolean;
  secretInputMode?: SecretInputMode;
  authChoice?: AuthChoice;
};

export async function setupSearch(
  config: OpenClawConfig,
  _runtime: RuntimeEnv,
  prompter: WizardPrompter,
  opts?: SetupSearchOptions,
): Promise<OpenClawConfig> {
  const offerNativeCodexSearch = shouldOfferNativeCodexSearch(config, {
    authChoice: opts?.authChoice,
  });

  if (offerNativeCodexSearch) {
    await prompter.note(
      [
        "Web search lets your agent look things up online.",
        "Choose how search should work for Codex-capable models.",
        "- Native Codex search uses Codex's built-in search capability.",
        "- Search with a configured provider uses Brave, Perplexity, Gemini, Grok, or Kimi.",
        "Docs: https://docs.openclaw.ai/tools/web",
      ].join("\n"),
      "Web search",
    );

    const searchMode = await prompter.select<InteractiveSearchMode | "__skip__">({
      message: "How should web search work?",
      options: [
        {
          value: "native-codex",
          label: "Native Codex search (recommended)",
          hint: "Use Codex built-in search for eligible Codex models",
        },
        {
          value: "configured-provider",
          label: "Search with a configured provider",
          hint: "Use Brave, Perplexity, Gemini, Grok, or Kimi with an API key",
        },
        {
          value: "__skip__",
          label: "Skip for now",
          hint: "Configure later with openclaw configure --section web",
        },
      ],
      initialValue:
        config.tools?.web?.search?.openaiCodex?.strategy === "native"
          ? "native-codex"
          : "configured-provider",
    });

    if (searchMode === "__skip__") {
      return config;
    }

    if (searchMode === "native-codex") {
      return await promptCodexSearchMode(config, prompter);
    }

    return await setupConfiguredProviderSearch(config, prompter, opts);
  }

  await prompter.note(
    [
      "Web search lets your agent look things up online.",
      "Choose a provider and paste your API key.",
      "Docs: https://docs.openclaw.ai/tools/web",
    ].join("\n"),
    "Web search",
  );

  return await setupConfiguredProviderSearch(config, prompter, opts);
}
