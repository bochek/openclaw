import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ThemeTokens = Record<string, string>;

function readBaseCss(): string {
  return fs.readFileSync(path.resolve(import.meta.dirname, "base.css"), "utf8");
}

function parseVariables(blockBody: string): ThemeTokens {
  return Object.fromEntries(
    [...blockBody.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)].map(([, key, value]) => [
      key,
      value.trim(),
    ]),
  );
}

function getBlock(css: string, selector: string): ThemeTokens {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  if (!match) {
    throw new Error(`Missing CSS block for ${selector}`);
  }
  return parseVariables(match[1]);
}

function resolveThemeTokens(css: string): Record<string, ThemeTokens> {
  const root = getBlock(css, ":root");
  const light = getBlock(css, ':root[data-theme-mode="light"]');
  const openknot = getBlock(css, ':root[data-theme="openknot"]');
  const openknotLight = getBlock(css, ':root[data-theme="openknot-light"]');
  const dash = getBlock(css, ':root[data-theme="dash"]');
  const dashLight = getBlock(css, ':root[data-theme="dash-light"]');

  return {
    dark: { ...root },
    light: { ...root, ...light },
    openknot: { ...root, ...openknot },
    "openknot-light": { ...root, ...light, ...openknotLight },
    dash: { ...root, ...dash },
    "dash-light": { ...root, ...light, ...dashLight },
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(hexToRgb(foreground)),
    relativeLuminance(hexToRgb(background)),
  ].toSorted((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("theme token WCAG contrast", () => {
  const themes = resolveThemeTokens(readBaseCss());

  const textPairs = [
    ["text", "bg", 4.5],
    ["text-strong", "bg", 7],
    ["card-foreground", "card", 4.5],
    ["popover-foreground", "popover", 4.5],
    ["secondary-foreground", "secondary", 4.5],
    ["primary-foreground", "primary", 4.5],
    ["accent", "bg", 4.5],
  ] as const;

  const semanticPairs = [
    ["info", "bg", 3],
    ["ok", "bg", 3],
    ["warn", "bg", 3],
    ["danger", "bg", 3],
  ] as const;

  for (const [themeName, tokens] of Object.entries(themes)) {
    it(`${themeName} keeps core text/action pairs at WCAG AA`, () => {
      for (const [foregroundKey, backgroundKey, minimum] of textPairs) {
        const foreground = tokens[foregroundKey];
        const background = tokens[backgroundKey];
        expect(
          contrastRatio(foreground, background),
          `${themeName}: ${foregroundKey} on ${backgroundKey}`,
        ).toBeGreaterThanOrEqual(minimum);
      }
    });

    it(`${themeName} keeps semantic colors above the non-text contrast floor`, () => {
      for (const [foregroundKey, backgroundKey, minimum] of semanticPairs) {
        const foreground = tokens[foregroundKey];
        const background = tokens[backgroundKey];
        expect(
          contrastRatio(foreground, background),
          `${themeName}: ${foregroundKey} on ${backgroundKey}`,
        ).toBeGreaterThanOrEqual(minimum);
      }
    });
  }
});
