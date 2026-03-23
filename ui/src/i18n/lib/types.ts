export type TranslationMap = { [key: string]: string | TranslationMap };

export const BUILTIN_LOCALES = ["en", "zh-CN", "zh-TW", "pt-BR", "de", "es"] as const;

export type BuiltinLocale = (typeof BUILTIN_LOCALES)[number];
export type Locale = BuiltinLocale | (string & {});

export interface I18nConfig {
  locale: Locale;
  fallbackLocale: BuiltinLocale;
  translations: Record<string, TranslationMap>;
}
