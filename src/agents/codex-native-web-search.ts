import type { OpenClawConfig } from "../config/config.js";

export type CodexNativeSearchStrategy = "openclaw" | "native";
export type CodexNativeSearchMode = "disabled" | "cached" | "live";
export type CodexNativeSearchContextSize = "low" | "medium" | "high";
export type CodexNativeSearchState = "openclaw_search" | "native_codex_search" | "search_disabled";

export type CodexNativeUserLocation = {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
};

export type ResolvedCodexNativeWebSearchConfig = {
  strategy: CodexNativeSearchStrategy;
  mode: CodexNativeSearchMode;
  allowedDomains?: string[];
  contextSize?: CodexNativeSearchContextSize;
  userLocation?: CodexNativeUserLocation;
};

export type CodexNativeSearchActivation = {
  modelProvider?: string;
  modelApi?: string;
  modelId?: string;
  globalWebSearchEnabled: boolean;
  codexStrategy: CodexNativeSearchStrategy;
  codexMode: CodexNativeSearchMode;
  hasCodexAuth: boolean;
  nativeEligible: boolean;
  nativeEnabled: boolean;
  state: CodexNativeSearchState;
};

type ProviderPayload = Record<string, unknown>;

type SearchConfig = NonNullable<NonNullable<NonNullable<OpenClawConfig["tools"]>["web"]>["search"]>;

type RawCodexConfig = SearchConfig["openaiCodex"];

type ResolveCodexNativeSearchActivationParams = {
  cfg?: OpenClawConfig;
  modelProvider?: string;
  modelApi?: string;
  modelId?: string;
  /**
   * Indicates whether a dedicated OpenAI Codex auth profile is available.
   * This is required for the direct `openai-codex` provider, but API-compatible
   * gateways using `openai-codex-responses` can rely on their own provider auth.
   */
  hasCodexAuth?: boolean;
};

export type PatchCodexNativeWebSearchPayloadResult =
  | {
      kind: "payload_not_object";
    }
  | {
      kind: "existing_native_tool";
      payload: ProviderPayload;
    }
  | {
      kind: "injected";
      payload: ProviderPayload;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAllowedDomains(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeOptionalText(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped.length > 0 ? deduped : undefined;
}

function normalizeUserLocation(value: unknown): CodexNativeUserLocation | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const normalized: CodexNativeUserLocation = {
    country: normalizeOptionalText(value.country),
    region: normalizeOptionalText(value.region),
    city: normalizeOptionalText(value.city),
    timezone: normalizeOptionalText(value.timezone),
  };
  return Object.values(normalized).some((entry) => entry) ? normalized : undefined;
}

function resolveRawCodexConfig(cfg?: OpenClawConfig): RawCodexConfig {
  return cfg?.tools?.web?.search?.openaiCodex;
}

function normalizeModelProvider(provider?: string): string | undefined {
  const normalized = provider?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function isDirectCodexProvider(provider?: string): boolean {
  return normalizeModelProvider(provider) === "openai-codex";
}

export function isCodexNativeWebSearchModel(params: {
  modelProvider?: string;
  modelApi?: string;
}): boolean {
  if (isDirectCodexProvider(params.modelProvider)) {
    return true;
  }
  const api = params.modelApi?.trim().toLowerCase();
  return api === "openai-codex-responses";
}

export function resolveCodexNativeWebSearchConfig(
  cfg?: OpenClawConfig,
): ResolvedCodexNativeWebSearchConfig {
  const raw = resolveRawCodexConfig(cfg);
  return {
    strategy: raw?.strategy === "native" ? "native" : "openclaw",
    mode: raw?.mode === "disabled" || raw?.mode === "live" ? raw.mode : "cached",
    allowedDomains: normalizeAllowedDomains(raw?.allowedDomains),
    contextSize:
      raw?.contextSize === "low" || raw?.contextSize === "medium" || raw?.contextSize === "high"
        ? raw.contextSize
        : undefined,
    userLocation: normalizeUserLocation(raw?.userLocation),
  };
}

export function resolveCodexNativeSearchActivation(
  params: ResolveCodexNativeSearchActivationParams,
): CodexNativeSearchActivation {
  const config = resolveCodexNativeWebSearchConfig(params.cfg);
  const globalWebSearchEnabled = params.cfg?.tools?.web?.search?.enabled !== false;
  const nativeEligible = isCodexNativeWebSearchModel(params);
  const hasCodexAuth = params.hasCodexAuth === true;
  const requiresDedicatedCodexAuth = isDirectCodexProvider(params.modelProvider);

  let state: CodexNativeSearchState;
  if (!globalWebSearchEnabled) {
    state = "search_disabled";
  } else if (!nativeEligible) {
    state = "openclaw_search";
  } else if (config.strategy !== "native") {
    state = "openclaw_search";
  } else if (config.mode === "disabled") {
    state = "search_disabled";
  } else if (requiresDedicatedCodexAuth && !hasCodexAuth) {
    state = "search_disabled";
  } else {
    state = "native_codex_search";
  }

  return {
    modelProvider: params.modelProvider,
    modelApi: params.modelApi,
    modelId: params.modelId,
    globalWebSearchEnabled,
    codexStrategy: config.strategy,
    codexMode: config.mode,
    hasCodexAuth,
    nativeEligible,
    nativeEnabled: state === "native_codex_search",
    state,
  };
}

export function buildCodexNativeWebSearchTool(
  config: ResolvedCodexNativeWebSearchConfig,
): Record<string, unknown> {
  const tool: Record<string, unknown> = {
    type: "web_search",
    external_web_access: config.mode === "live",
  };

  if (config.allowedDomains && config.allowedDomains.length > 0) {
    tool.filters = {
      allowed_domains: config.allowedDomains,
    };
  }

  if (config.contextSize) {
    tool.search_context_size = config.contextSize;
  }

  if (config.userLocation) {
    tool.user_location = {
      type: "approximate",
      ...config.userLocation,
    };
  }

  return tool;
}

export function isNativeCodexWebSearchTool(tool: unknown): boolean {
  if (!isRecord(tool)) {
    return false;
  }
  return tool.type === "web_search" || tool.type === "web_search_2025_08_26";
}

export function patchPayloadForCodexNativeWebSearch(params: {
  payload: unknown;
  config: ResolvedCodexNativeWebSearchConfig;
}): PatchCodexNativeWebSearchPayloadResult {
  if (!isRecord(params.payload)) {
    return { kind: "payload_not_object" };
  }

  const payload = params.payload as ProviderPayload;
  const originalTools = Array.isArray(payload.tools) ? payload.tools : [];

  if (originalTools.some((tool) => isNativeCodexWebSearchTool(tool))) {
    return {
      kind: "existing_native_tool",
      payload: {
        ...payload,
        tools: originalTools,
      },
    };
  }

  const tools = [...originalTools, buildCodexNativeWebSearchTool(params.config)];
  return {
    kind: "injected",
    payload: {
      ...payload,
      tools,
    },
  };
}
