import { Type } from "@sinclair/typebox";
import { formatCliCommand as _formatCliCommand } from "../../cli/command-format.js";
import type { OpenClawConfig } from "../../config/config.js";
import { logVerbose } from "../../globals.js";
import { resolveCapabilitySlotSelection } from "../../plugins/capability-slots.js";
import { loadOpenClawPlugins } from "../../plugins/loader.js";
import { getActivePluginRegistry } from "../../plugins/runtime.js";
import type {
  SearchProviderContext,
  SearchProviderErrorResult,
  SearchProviderPlugin,
  SearchProviderRequest,
  SearchProviderSuccessResult,
} from "../../plugins/types.js";
import type { RuntimeWebSearchMetadata } from "../../secrets/runtime-web-tools.js";
import { wrapWebContent } from "../../security/external-content.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringArrayParam, readStringParam } from "./common.js";
import { resolveCitationRedirectUrl } from "./web-search-citation-redirect.js";
import {
  CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  normalizeCacheKey,
  readCache,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
  writeCache,
} from "./web-shared.js";

const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;

const SEARCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERPLEXITY_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const SEARCH_QUERY_SCHEMA_FIELDS = {
  query: Type.String({ description: "Search query string." }),
  count: Type.Optional(
    Type.Number({
      description: "Number of results to return (1-10).",
      minimum: 1,
      maximum: MAX_SEARCH_COUNT,
    }),
  ),
} as const;

const SEARCH_FILTER_SCHEMA_FIELDS = {
  country: Type.Optional(
    Type.String({
      description:
        "2-letter country code for region-specific results (e.g., 'DE', 'US', 'ALL'). Default: 'US'.",
    }),
  ),
  language: Type.Optional(
    Type.String({
      description: "ISO 639-1 language code for results (e.g., 'en', 'de', 'fr').",
    }),
  ),
  freshness: Type.Optional(
    Type.String({
      description: "Filter by time: 'day' (24h), 'week', 'month', or 'year'.",
    }),
  ),
  date_after: Type.Optional(
    Type.String({
      description: "Only results published after this date (YYYY-MM-DD).",
    }),
  ),
  date_before: Type.Optional(
    Type.String({
      description: "Only results published before this date (YYYY-MM-DD).",
    }),
  ),
} as const;

const SEARCH_PLUGIN_EXTENSION_FIELDS = {
  search_lang: Type.Optional(
    Type.String({
      description: "Optional provider-specific search language override.",
    }),
  ),
  ui_lang: Type.Optional(
    Type.String({
      description: "Optional provider-specific UI locale override.",
    }),
  ),
  domain_filter: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional provider-specific domain allow/deny filter.",
    }),
  ),
  max_tokens: Type.Optional(
    Type.Number({
      description: "Optional provider-specific content budget.",
      minimum: 1,
    }),
  ),
  max_tokens_per_page: Type.Optional(
    Type.Number({
      description: "Optional provider-specific per-page content budget.",
      minimum: 1,
    }),
  ),
} as const;

function normalizeToIsoDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (ISO_DATE_PATTERN.test(trimmed)) {
    return isValidIsoDate(trimmed) ? trimmed : undefined;
  }
  const match = trimmed.match(PERPLEXITY_DATE_PATTERN);
  if (match) {
    const [, month, day, year] = match;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return isValidIsoDate(iso) ? iso : undefined;
  }
  return undefined;
}

type WebSearchConfig = NonNullable<OpenClawConfig["tools"]>["web"] extends infer Web
  ? Web extends { search?: infer Search }
    ? Search
    : undefined
  : undefined;

function resolveSearchConfig(cfg?: OpenClawConfig): WebSearchConfig {
  const search = cfg?.tools?.web?.search;
  if (!search || typeof search !== "object") {
    return undefined;
  }
  return search as WebSearchConfig;
}

function resolveSearchEnabled(params: { search?: WebSearchConfig; sandboxed?: boolean }): boolean {
  if (typeof params.search?.enabled === "boolean") {
    return params.search.enabled;
  }
  if (params.sandboxed) {
    return true;
  }
  return true;
}

function resolveSearchCount(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
  return clamped;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function normalizeSearchProviderId(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function stableSerializeForCache(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeForCache(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerializeForCache(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildSearchRequestCacheIdentity(params: {
  query: string;
  count: number;
  country?: string;
  language?: string;
  search_lang?: string;
  ui_lang?: string;
  freshness?: string;
  dateAfter?: string;
  dateBefore?: string;
  domainFilter?: string[];
  maxTokens?: number;
  maxTokensPerPage?: number;
}): string {
  return [
    params.query,
    params.count,
    params.country || "default",
    params.language || "default",
    params.search_lang || "default",
    params.ui_lang || "default",
    params.freshness || "default",
    params.dateAfter || "default",
    params.dateBefore || "default",
    params.domainFilter?.join(",") || "default",
    params.maxTokens || "default",
    params.maxTokensPerPage || "default",
  ].join(":");
}

function createExtensibleWebSearchSchema() {
  return Type.Object({
    ...SEARCH_QUERY_SCHEMA_FIELDS,
    ...SEARCH_FILTER_SCHEMA_FIELDS,
    ...SEARCH_PLUGIN_EXTENSION_FIELDS,
  });
}

function sanitizeSearchUrl(url: unknown): string | undefined {
  if (typeof url !== "string" || url.trim() === "") {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // Ignore invalid URLs from plugin providers.
  }
  return undefined;
}

function createMissingSearchProviderPlugin(providerId: string): SearchProviderPlugin {
  return {
    id: providerId,
    name: providerId,
    description: `Search provider "${providerId}" is configured but not registered.`,
    search: async () => ({
      error: "unknown_search_provider",
      message: `Configured web search provider "${providerId}" is not registered.`,
      docs: "https://docs.openclaw.ai/tools/web",
    }),
  };
}

function executePluginSearchProvider(params: {
  provider: SearchProviderPlugin;
  request: SearchProviderRequest;
  context: SearchProviderContext;
}): Promise<Record<string, unknown>> {
  if (params.provider.pluginOwnedExecution) {
    return params.provider.search(params.request, params.context).then((result) => {
      if ("error" in result && typeof result.error === "string") {
        const errorResult: SearchProviderErrorResult = result;
        return {
          ...errorResult,
          provider: params.provider.id,
          ...(typeof errorResult.message === "string"
            ? {}
            : {
                message: `Search provider "${params.provider.id}" returned error "${errorResult.error}".`,
              }),
        };
      }
      return result as Record<string, unknown>;
    });
  }

  const pluginConfigKey = params.context.pluginConfig
    ? stableSerializeForCache(params.context.pluginConfig)
    : "no-plugin-config";
  const cacheKey = normalizeCacheKey(
    `${params.provider.id}:${params.provider.pluginId || "unregistered"}:${pluginConfigKey}:${buildSearchRequestCacheIdentity(
      {
        query: params.request.query,
        count: params.request.count,
        country: params.request.country,
        language: params.request.language,
        search_lang: params.request.search_lang,
        ui_lang: params.request.ui_lang,
        freshness: params.request.freshness,
        dateAfter: params.request.dateAfter,
        dateBefore: params.request.dateBefore,
        domainFilter: params.request.domainFilter,
        maxTokens: params.request.maxTokens,
        maxTokensPerPage: params.request.maxTokensPerPage,
      },
    )}`,
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) {
    return Promise.resolve({ ...cached.value, cached: true });
  }

  const startedAt = Date.now();
  return params.provider
    .search(params.request, params.context)
    .then((result) => {
      if ("error" in result && typeof result.error === "string") {
        const errorResult: SearchProviderErrorResult = result;
        return {
          ...errorResult,
          provider: params.provider.id,
          ...(typeof errorResult.message === "string"
            ? {}
            : {
                message: `Search provider "${params.provider.id}" returned error "${errorResult.error}".`,
              }),
        };
      }

      const successResult: SearchProviderSuccessResult = result;
      const rawResults = Array.isArray(successResult.results)
        ? successResult.results.filter((entry) => entry && typeof entry === "object")
        : [];
      const normalizedResults = rawResults
        .map((entry) => {
          const value = entry as Record<string, unknown>;
          const url = sanitizeSearchUrl(value.url);
          if (!url) {
            return undefined;
          }
          const title =
            typeof value.title === "string" ? wrapWebContent(value.title, "web_search") : "";
          const description =
            typeof value.description === "string"
              ? wrapWebContent(value.description, "web_search")
              : undefined;
          const published = typeof value.published === "string" ? value.published : undefined;
          return { title, url, description, published };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      const rawCitations = Array.isArray(successResult.citations) ? successResult.citations : [];
      const normalizedCitations = rawCitations
        .map((citation) => {
          if (typeof citation === "string") {
            return sanitizeSearchUrl(citation);
          }
          if (!citation || typeof citation !== "object") {
            return undefined;
          }
          const value = citation as Record<string, unknown>;
          const url = sanitizeSearchUrl(value.url);
          if (!url) {
            return undefined;
          }
          const title =
            typeof value.title === "string" ? wrapWebContent(value.title, "web_search") : undefined;
          return title ? { url, title } : { url };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      const payload: Record<string, unknown> = {
        query: params.request.query,
        provider: params.provider.id,
        tookMs:
          typeof successResult.tookMs === "number" && Number.isFinite(successResult.tookMs)
            ? successResult.tookMs
            : Date.now() - startedAt,
        externalContent: {
          untrusted: true,
          source: "web_search",
          provider: params.provider.id,
          wrapped: true,
        },
      };
      if (normalizedResults.length > 0) {
        payload.results = normalizedResults;
        payload.count = normalizedResults.length;
      }
      if (typeof successResult.content === "string") {
        payload.content = wrapWebContent(successResult.content, "web_search");
      }
      if (normalizedCitations.length > 0) {
        payload.citations = normalizedCitations;
      }
      writeCache(SEARCH_CACHE, cacheKey, payload, params.context.cacheTtlMs);
      return payload;
    })
    .catch((error) => ({
      error: "search_failed",
      provider: params.provider.id,
      message: error instanceof Error ? error.message : String(error),
    }));
}

function getRegisteredSearchProviders(config?: OpenClawConfig): SearchProviderPlugin[] {
  let registry = getActivePluginRegistry();
  if (!registry || registry.searchProviders.length === 0) {
    registry = loadOpenClawPlugins({ config });
  }
  return registry.searchProviders.map((entry) => entry.provider);
}

function resolveConfiguredSearchProviderId(params: {
  config?: OpenClawConfig;
  search?: WebSearchConfig;
}): string | null | undefined {
  if (params.config) {
    return resolveCapabilitySlotSelection(params.config, "providers.search");
  }
  if (!params.search) {
    return undefined;
  }
  return resolveCapabilitySlotSelection(
    { tools: { web: { search: params.search } } } as OpenClawConfig,
    "providers.search",
  );
}

function sortRegisteredSearchProviders(providers: SearchProviderPlugin[]): SearchProviderPlugin[] {
  return [...providers].toSorted((left, right) => {
    const leftPriority = left.setup?.autodetectPriority ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = right.setup?.autodetectPriority ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.id.localeCompare(right.id);
  });
}

function resolveRegisteredSearchProvider(params: {
  search?: WebSearchConfig;
  config?: OpenClawConfig;
  runtimeWebSearch?: RuntimeWebSearchMetadata;
}): SearchProviderPlugin {
  const configuredProviderId = normalizeSearchProviderId(
    resolveConfiguredSearchProviderId({
      config: params.config,
      search: params.search,
    }) ?? undefined,
  );
  const registeredProviders = new Map(
    sortRegisteredSearchProviders(getRegisteredSearchProviders(params.config)).map((provider) => [
      normalizeSearchProviderId(provider.id),
      provider,
    ]),
  );

  if (configuredProviderId) {
    const registeredProvider = registeredProviders.get(configuredProviderId);
    if (registeredProvider) {
      return registeredProvider;
    }
    logVerbose(
      `web_search: configured provider "${configuredProviderId}" is not registered; failing closed`,
    );
    return createMissingSearchProviderPlugin(configuredProviderId);
  } else {
    for (const provider of registeredProviders.values()) {
      let isAvailable = false;
      try {
        isAvailable = provider.isAvailable?.(params.config) ?? false;
      } catch (error) {
        logVerbose(
          `web_search: plugin provider "${provider.id}" auto-detect failed during isAvailable: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      if (isAvailable) {
        logVerbose(
          `web_search: no provider configured, auto-detected plugin provider "${provider.id}"`,
        );
        return provider;
      }
    }
  }
  const firstRegisteredProvider = registeredProviders.values().next().value;
  if (firstRegisteredProvider) {
    return firstRegisteredProvider;
  }
  return createMissingSearchProviderPlugin(configuredProviderId || "web-search");
}

function createSearchProviderSchema(params: {
  provider: SearchProviderPlugin;
  search?: WebSearchConfig;
  runtimeWebSearch?: RuntimeWebSearchMetadata;
}) {
  if (params.provider.setup?.resolveRequestSchema) {
    return params.provider.setup.resolveRequestSchema({
      config: params.search
        ? ({ tools: { web: { search: params.search } } } as OpenClawConfig)
        : undefined,
      runtimeMetadata: params.runtimeWebSearch as Record<string, unknown> | undefined,
    });
  }
  if (params.provider.setup?.requestSchema) {
    return params.provider.setup.requestSchema;
  }
  return createExtensibleWebSearchSchema();
}

function parseSearchProviderRequest(
  args: Record<string, unknown>,
  search?: WebSearchConfig,
): SearchProviderRequest {
  const rawFreshness = readStringParam(args, "freshness");
  const rawDateAfter = readStringParam(args, "date_after");
  const rawDateBefore = readStringParam(args, "date_before");

  if (rawFreshness && (rawDateAfter || rawDateBefore)) {
    return {
      query: readStringParam(args, "query", { required: true }),
      count: resolveSearchCount(
        readNumberParam(args, "count", { integer: true }) ?? search?.maxResults ?? undefined,
        DEFAULT_SEARCH_COUNT,
      ),
      freshness: "__invalid_conflicting_time_filters__",
    };
  }

  return {
    query: readStringParam(args, "query", { required: true }),
    count: resolveSearchCount(
      readNumberParam(args, "count", { integer: true }) ?? search?.maxResults ?? undefined,
      DEFAULT_SEARCH_COUNT,
    ),
    country: readStringParam(args, "country"),
    language: readStringParam(args, "language"),
    search_lang: readStringParam(args, "search_lang"),
    ui_lang: readStringParam(args, "ui_lang"),
    freshness: rawFreshness,
    dateAfter: rawDateAfter ? normalizeToIsoDate(rawDateAfter) : undefined,
    dateBefore: rawDateBefore ? normalizeToIsoDate(rawDateBefore) : undefined,
    domainFilter: readStringArrayParam(args, "domain_filter") ?? undefined,
    maxTokens: readNumberParam(args, "max_tokens", { integer: true }) ?? undefined,
    maxTokensPerPage: readNumberParam(args, "max_tokens_per_page", { integer: true }) ?? undefined,
    providerConfig: search as Record<string, unknown> | undefined,
  };
}

function resolveSearchProviderPluginConfig(
  config: OpenClawConfig | undefined,
  provider: SearchProviderPlugin,
): Record<string, unknown> | undefined {
  if (!provider.pluginId) {
    return undefined;
  }
  const pluginConfig = config?.plugins?.entries?.[provider.pluginId]?.config;
  return pluginConfig && typeof pluginConfig === "object" ? pluginConfig : undefined;
}

function formatWebSearchExecutionLog(provider: SearchProviderPlugin): string {
  if (provider.pluginId) {
    return `web_search: executing plugin provider "${provider.id}" from "${provider.pluginId}"`;
  }
  return `web_search: executing registered provider "${provider.id}"`;
}

export function createWebSearchTool(options?: {
  config?: OpenClawConfig;
  sandboxed?: boolean;
  runtimeWebSearch?: RuntimeWebSearchMetadata;
}): AnyAgentTool | null {
  const search = resolveSearchConfig(options?.config);
  if (!resolveSearchEnabled({ search, sandboxed: options?.sandboxed })) {
    return null;
  }

  const provider = resolveRegisteredSearchProvider({
    search,
    config: options?.config,
    runtimeWebSearch: options?.runtimeWebSearch,
  });
  const parameters = createSearchProviderSchema({
    provider,
    search,
    runtimeWebSearch: options?.runtimeWebSearch,
  });
  const description =
    provider.description ??
    `Search the web using ${provider.name}. Returns relevant results for research.`;

  return {
    label: "Web Search",
    name: "web_search",
    description,
    parameters,
    execute: async (_toolCallId, args) => {
      const rawArgs = args as Record<string, unknown>;
      const rawFreshness = readStringParam(rawArgs, "freshness");
      const rawDateAfter = readStringParam(rawArgs, "date_after");
      const rawDateBefore = readStringParam(rawArgs, "date_before");
      if (rawFreshness && (rawDateAfter || rawDateBefore)) {
        return jsonResult({
          error: "conflicting_time_filters",
          message:
            "freshness and date_after/date_before cannot be used together. Use either freshness (day/week/month/year) or a date range (date_after/date_before), not both.",
          docs: "https://docs.openclaw.ai/tools/web",
        });
      }

      const request = parseSearchProviderRequest(rawArgs, search);
      if (rawDateAfter && !request.dateAfter) {
        return jsonResult({
          error: "invalid_date",
          message: "date_after must be YYYY-MM-DD format.",
          docs: "https://docs.openclaw.ai/tools/web",
        });
      }
      if (rawDateBefore && !request.dateBefore) {
        return jsonResult({
          error: "invalid_date",
          message: "date_before must be YYYY-MM-DD format.",
          docs: "https://docs.openclaw.ai/tools/web",
        });
      }
      if (request.dateAfter && request.dateBefore && request.dateAfter > request.dateBefore) {
        return jsonResult({
          error: "invalid_date_range",
          message: "date_after must be before date_before.",
          docs: "https://docs.openclaw.ai/tools/web",
        });
      }

      logVerbose(formatWebSearchExecutionLog(provider));
      const context = {
        config: options?.config ?? {},
        timeoutSeconds: resolveTimeoutSeconds(search?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
        cacheTtlMs: resolveCacheTtlMs(search?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
        pluginConfig: resolveSearchProviderPluginConfig(options?.config, provider),
      };
      const result = await executePluginSearchProvider({
        provider,
        request,
        context,
      });
      return jsonResult(result);
    },
  };
}

export const __testing = {
  resolveSearchProvider: resolveRegisteredSearchProvider,
  resolveRegisteredSearchProvider,
  normalizeToIsoDate,
  SEARCH_CACHE,
  resolveRedirectUrl: resolveCitationRedirectUrl,
} as const;
