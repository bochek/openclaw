export type ImportReviewEntry = {
  title: string;
  relativePath: string;
  pagePath: string;
  importedAliases: string[];
  importedTags: string[];
  bodyTextLength: number;
  nonEmptyLineCount: number;
};

function normalizeImportReviewKey(value: string): string {
  return value.trim().toLowerCase();
}

export function buildImportDuplicateClusters(reviewEntries: ImportReviewEntry[]): Array<{
  label: string;
  entryCount: number;
  entries: ImportReviewEntry[];
}> {
  const clusters = new Map<string, { label: string; entries: ImportReviewEntry[] }>();
  for (const entry of reviewEntries) {
    for (const label of [entry.title, ...entry.importedAliases]) {
      const normalized = normalizeImportReviewKey(label);
      if (!normalized) {
        continue;
      }
      const current = clusters.get(normalized) ?? { label, entries: [] };
      if (!current.entries.some((candidate) => candidate.pagePath === entry.pagePath)) {
        current.entries.push(entry);
      }
      clusters.set(normalized, current);
    }
  }
  return [...clusters.values()]
    .filter((cluster) => cluster.entries.length > 1)
    .map((cluster) => ({
      label: cluster.label,
      entryCount: cluster.entries.length,
      entries: [...cluster.entries].toSorted((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      ),
    }))
    .toSorted((left, right) => {
      if (left.entryCount !== right.entryCount) {
        return right.entryCount - left.entryCount;
      }
      return left.label.localeCompare(right.label);
    });
}

export function buildLowSignalImportEntries(
  reviewEntries: ImportReviewEntry[],
): ImportReviewEntry[] {
  return reviewEntries
    .filter((entry) => entry.bodyTextLength < 80 || entry.nonEmptyLineCount <= 2)
    .toSorted((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function buildImportReviewBody(params: {
  inputPath: string;
  profileId: string;
  profileResolution: "automatic" | "explicit";
  artifactCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  removedCount: number;
  pagePaths: string[];
  reviewEntries: ImportReviewEntry[];
}): string {
  const lines = [
    "# Import Review",
    "",
    "## Summary",
    `- Input: \`${params.inputPath}\``,
    `- Profile: \`${params.profileId}\` (${params.profileResolution})`,
    `- Artifacts discovered: ${params.artifactCount}`,
    `- Imported: ${params.importedCount}`,
    `- Updated: ${params.updatedCount}`,
    `- Unchanged: ${params.skippedCount}`,
    `- Removed: ${params.removedCount}`,
    "",
    "## Imported Pages",
  ];
  if (params.pagePaths.length === 0) {
    lines.push("- No importable pages were written.");
  } else {
    for (const pagePath of params.pagePaths) {
      lines.push(`- ${pagePath}`);
    }
  }

  const duplicateClusters = buildImportDuplicateClusters(params.reviewEntries);
  lines.push("", "## Duplicate Title/Alias Clusters");
  if (duplicateClusters.length === 0) {
    lines.push("- No duplicate title or alias clusters detected.");
  } else {
    for (const cluster of duplicateClusters) {
      lines.push(
        `- \`${cluster.label}\` (${cluster.entryCount} notes): ${cluster.entries
          .map((entry) => `\`${entry.relativePath}\``)
          .join(", ")}`,
      );
    }
  }

  const lowSignalEntries = buildLowSignalImportEntries(params.reviewEntries);
  lines.push("", "## Low-Signal Sources");
  if (lowSignalEntries.length === 0) {
    lines.push("- No obviously low-signal imported sources detected.");
  } else {
    for (const entry of lowSignalEntries) {
      lines.push(
        `- \`${entry.relativePath}\` (${entry.title}): ${entry.nonEmptyLineCount} non-empty lines, ${entry.bodyTextLength} characters`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
