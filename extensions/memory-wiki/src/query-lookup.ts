import path from "node:path";
import type { WikiPageSummary } from "./markdown.js";

export type QueryableWikiLookupPage = Pick<
  WikiPageSummary,
  "relativePath" | "title" | "id" | "importedAliases"
>;

export function normalizeLookupKey(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/");
  return normalized.endsWith(".md") ? normalized : normalized.replace(/\/+$/, "");
}

function normalizeLookupLabel(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function resolveQueryableWikiPageByLookup<T extends QueryableWikiLookupPage>(
  pages: T[],
  lookup: string,
): T | null {
  const key = normalizeLookupKey(lookup);
  const withExtension = key.endsWith(".md") ? key : `${key}.md`;
  const normalizedLabel = normalizeLookupLabel(lookup);
  return (
    pages.find((page) => page.relativePath === key) ??
    pages.find((page) => page.relativePath === withExtension) ??
    pages.find((page) => page.relativePath.replace(/\.md$/i, "") === key) ??
    pages.find((page) => path.basename(page.relativePath, ".md") === key) ??
    pages.find((page) => page.id === key) ??
    pages.find((page) => normalizeLookupLabel(page.title) === normalizedLabel) ??
    pages.find((page) =>
      page.importedAliases.some((alias) => normalizeLookupLabel(alias) === normalizedLabel),
    ) ??
    null
  );
}
