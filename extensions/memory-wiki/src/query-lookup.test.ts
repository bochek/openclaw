import { describe, expect, it } from "vitest";
import { resolveQueryableWikiPageByLookup } from "./query-lookup.js";

describe("resolveQueryableWikiPageByLookup", () => {
  const pages = [
    {
      relativePath: "sources/alpha-import.md",
      title: "Alpha Imported Note",
      id: "source.import.alpha",
      importedAliases: ["Alpha Canon"],
    },
    {
      relativePath: "entities/beta.md",
      title: "Beta",
      id: "entity.beta",
      importedAliases: [],
    },
  ];

  it("resolves pages by title", () => {
    expect(resolveQueryableWikiPageByLookup(pages, "Alpha Imported Note")).toMatchObject({
      relativePath: "sources/alpha-import.md",
    });
  });

  it("resolves pages by imported alias case-insensitively", () => {
    expect(resolveQueryableWikiPageByLookup(pages, "alpha canon")).toMatchObject({
      relativePath: "sources/alpha-import.md",
    });
  });
});
