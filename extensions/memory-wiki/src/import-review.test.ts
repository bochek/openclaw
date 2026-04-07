import { describe, expect, it } from "vitest";
import {
  buildImportBodyDuplicateClusters,
  buildImportDuplicateClusters,
  buildImportReviewBody,
  buildLowSignalImportEntries,
  type ImportReviewEntry,
} from "./import-review.js";

const entries: ImportReviewEntry[] = [
  {
    title: "Shared Title",
    relativePath: "alpha.md",
    pagePath: "sources/alpha.md",
    importedAliases: ["Shared Alias"],
    importedTags: ["alpha"],
    bodyTextLength: 120,
    nonEmptyLineCount: 5,
    bodyFingerprint: "body-dup-1",
  },
  {
    title: "Shared Title",
    relativePath: "beta.md",
    pagePath: "sources/beta.md",
    importedAliases: ["Shared Alias"],
    importedTags: ["beta"],
    bodyTextLength: 110,
    nonEmptyLineCount: 4,
    bodyFingerprint: "body-dup-1",
  },
  {
    title: "Tiny",
    relativePath: "tiny.md",
    pagePath: "sources/tiny.md",
    importedAliases: [],
    importedTags: [],
    bodyTextLength: 12,
    nonEmptyLineCount: 2,
    bodyFingerprint: "tiny-body",
  },
];

describe("import-review", () => {
  it("clusters duplicate imported titles and aliases", () => {
    const clusters = buildImportDuplicateClusters(entries);
    expect(clusters[0]).toMatchObject({
      label: "Shared Alias",
      entryCount: 2,
    });
    expect(clusters[1]).toMatchObject({
      label: "Shared Title",
      entryCount: 2,
    });
  });

  it("flags low-signal imported entries", () => {
    expect(buildLowSignalImportEntries(entries)).toEqual([
      expect.objectContaining({ relativePath: "tiny.md" }),
    ]);
  });

  it("clusters duplicate imported note bodies", () => {
    expect(buildImportBodyDuplicateClusters(entries)).toEqual([
      expect.objectContaining({
        fingerprint: "body-dup-1",
        entryCount: 2,
      }),
    ]);
  });

  it("renders duplicate and low-signal sections in the review body", () => {
    const body = buildImportReviewBody({
      inputPath: "/tmp/vault",
      profileId: "markdown-vault",
      profileResolution: "automatic",
      artifactCount: 3,
      importedCount: 3,
      updatedCount: 0,
      skippedCount: 0,
      removedCount: 0,
      pagePaths: entries.map((entry) => entry.pagePath),
      reviewEntries: entries,
    });

    expect(body).toContain("## Duplicate Title/Alias Clusters");
    expect(body).toContain("`Shared Title` (2 notes)");
    expect(body).toContain("## Duplicate Body Clusters");
    expect(body).toContain("`body-dup-1` (2 notes)");
    expect(body).toContain("## Low-Signal Sources");
    expect(body).toContain("`tiny.md` (Tiny): 2 non-empty lines, 12 characters");
  });
});
