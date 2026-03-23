import { BUILTIN_LOCALES, type BuiltinLocale, type Locale, type TranslationMap } from "./types.ts";

type LazyLocale = Exclude<BuiltinLocale, "en">;
type LocaleModule = Record<string, TranslationMap>;

type LazyLocaleRegistration = {
  exportName: string;
  loader: () => Promise<LocaleModule>;
};

type RemoteLocaleRegistration = {
  url: string;
};

export const DEFAULT_LOCALE: BuiltinLocale = "en";

const LAZY_LOCALES: ReadonlySet<LazyLocale> = new Set(["zh-CN", "zh-TW", "pt-BR", "de", "es"]);

const LAZY_LOCALE_REGISTRY: Record<LazyLocale, LazyLocaleRegistration> = {
  "zh-CN": {
    exportName: "zh_CN",
    loader: () => import("../locales/zh-CN.ts"),
  },
  "zh-TW": {
    exportName: "zh_TW",
    loader: () => import("../locales/zh-TW.ts"),
  },
  "pt-BR": {
    exportName: "pt_BR",
    loader: () => import("../locales/pt-BR.ts"),
  },
  de: {
    exportName: "de",
    loader: () => import("../locales/de.ts"),
  },
  es: {
    exportName: "es",
    loader: () => import("../locales/es.ts"),
  },
};

const remoteLocaleRegistry = new Map<string, RemoteLocaleRegistration>();
const supportedLocales: Locale[] = [...BUILTIN_LOCALES];

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = supportedLocales;

function isTranslationMap(value: unknown): value is TranslationMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  for (const entry of Object.values(value)) {
    if (typeof entry === "string") {
      continue;
    }
    if (!isTranslationMap(entry)) {
      return false;
    }
  }
  return true;
}

function syncSupportedLocales() {
  const dynamic = Array.from(remoteLocaleRegistry.keys()).filter(
    (locale) => !BUILTIN_LOCALES.includes(locale as BuiltinLocale),
  );
  dynamic.sort((left, right) => left.localeCompare(right));
  supportedLocales.splice(0, supportedLocales.length, ...BUILTIN_LOCALES, ...dynamic);
}

export function registerRemoteLocaleTranslationSource(params: {
  locale: string;
  url: string;
}): void {
  const locale = params.locale.trim();
  const url = params.url.trim();
  if (!locale || !url) {
    return;
  }
  remoteLocaleRegistry.set(locale, { url });
  syncSupportedLocales();
}

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && supportedLocales.includes(value as Locale);
}

function isLazyLocale(locale: Locale): locale is LazyLocale {
  return LAZY_LOCALES.has(locale as LazyLocale);
}

export function resolveNavigatorLocale(navLang: string): BuiltinLocale {
  if (navLang.startsWith("zh")) {
    return navLang === "zh-TW" || navLang === "zh-HK" ? "zh-TW" : "zh-CN";
  }
  if (navLang.startsWith("pt")) {
    return "pt-BR";
  }
  if (navLang.startsWith("de")) {
    return "de";
  }
  if (navLang.startsWith("es")) {
    return "es";
  }
  return DEFAULT_LOCALE;
}

async function loadRemoteLocaleTranslation(locale: Locale): Promise<TranslationMap | null> {
  const registration = remoteLocaleRegistry.get(locale);
  if (!registration || typeof fetch !== "function") {
    return null;
  }
  const res = await fetch(registration.url, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) {
    return null;
  }
  const parsed = (await res.json()) as unknown;
  return isTranslationMap(parsed) ? parsed : null;
}

export async function loadLazyLocaleTranslation(locale: Locale): Promise<TranslationMap | null> {
  const remoteTranslation = await loadRemoteLocaleTranslation(locale);
  if (remoteTranslation) {
    return remoteTranslation;
  }
  if (!isLazyLocale(locale)) {
    return null;
  }
  const registration = LAZY_LOCALE_REGISTRY[locale];
  const module = await registration.loader();
  return module[registration.exportName] ?? null;
}
