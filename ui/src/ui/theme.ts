export type ConcreteTheme = "dark" | "light" | "openknot" | "fieldmanual" | "clawdash";
export type ThemeMode = ConcreteTheme | "system";
export type ResolvedTheme = ConcreteTheme;

export const VALID_THEMES = new Set<ThemeMode>([
  "dark",
  "light",
  "openknot",
  "fieldmanual",
  "clawdash",
  "system",
]);

const LEGACY_MAP: Record<string, ThemeMode> = {
  defaultTheme: "dark",
  docsTheme: "light",
  lightTheme: "openknot",
  landingTheme: "openknot",
  newTheme: "openknot",
};

export function prefersLightScheme(): boolean {
  if (typeof globalThis.matchMedia !== "function") {
    return false;
  }
  return globalThis.matchMedia("(prefers-color-scheme: light)").matches;
}

export function resolveSystemTheme(): ResolvedTheme {
  return prefersLightScheme() ? "light" : "dark";
}

export function resolveTheme(mode: string): ResolvedTheme {
  if (mode === "system") {
    return resolveSystemTheme();
  }
  if (VALID_THEMES.has(mode as ThemeMode)) {
    return mode as ResolvedTheme;
  }
  return (LEGACY_MAP[mode] as ResolvedTheme) ?? "dark";
}
