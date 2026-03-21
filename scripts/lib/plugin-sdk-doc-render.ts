import path from "node:path";
import {
  pluginSdkDocCategoryLabels,
  type PluginSdkDocCategoryIndex,
  type PluginSdkDocExport,
  type PluginSdkDocModule,
} from "./plugin-sdk-doc-ir.ts";

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatMaybe(value: string | null | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

function renderSourceLink(
  label: string,
  source: { path: string; url: string; line: number },
): string {
  return `[${label}](${source.url})`;
}

function renderExportIndexRow(entrypoint: PluginSdkDocModule, item: PluginSdkDocExport): string {
  const link = `[\`${item.exportName}\`](#${item.exportName.toLowerCase()})`;
  const summary = escapeTableCell(formatMaybe(item.summary, "No inline TSDoc yet."));
  return `| ${link} | \`${item.kind}\` | ${summary} |`;
}

function renderDeclaration(item: PluginSdkDocExport): string {
  if (!item.declaration) {
    return "";
  }
  return [`**Declaration**`, "", "```ts", item.declaration, "```", ""].join("\n");
}

function renderTags(item: PluginSdkDocExport): string {
  const extraTags = item.tags.filter(
    (tag) => tag.name !== "deprecated" && tag.name !== "remarks" && tag.text.trim(),
  );
  if (extraTags.length === 0) {
    return "";
  }

  const lines = ["**Tags**", ""];
  for (const tag of extraTags) {
    lines.push(`- \`${tag.name}\`: ${tag.text}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderExportDetails(item: PluginSdkDocExport): string {
  const lines = [`### ${item.exportName}`, "", `- Kind: \`${item.kind}\``];

  if (item.source) {
    lines.push(
      `- Source: ${renderSourceLink(`${item.source.path}:${item.source.line}`, item.source)}`,
    );
  }

  if (item.deprecated) {
    lines.push(`- Deprecated: ${item.deprecated}`);
  }

  lines.push("");

  if (item.summary) {
    lines.push(item.summary, "");
  } else {
    lines.push("No inline TSDoc is available for this export yet.", "");
  }

  if (item.remarks) {
    lines.push("**Remarks**", "", item.remarks, "");
  }

  const declaration = renderDeclaration(item);
  if (declaration) {
    lines.push(declaration);
  }

  const tags = renderTags(item);
  if (tags) {
    lines.push(tags);
  }

  return lines.join("\n");
}

function renderRelatedModules(
  moduleDoc: PluginSdkDocModule,
  modules: PluginSdkDocModule[],
): string {
  const related = modules
    .filter(
      (candidate) =>
        candidate.category === moduleDoc.category && candidate.entrypoint !== moduleDoc.entrypoint,
    )
    .toSorted((left, right) => left.importSpecifier.localeCompare(right.importSpecifier));

  if (related.length === 0) {
    return "";
  }

  const lines = ["## Related modules", ""];
  for (const item of related) {
    lines.push(`- [\`${item.importSpecifier}\`](${item.route})`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderPluginSdkModuleDoc(
  moduleDoc: PluginSdkDocModule,
  modules: PluginSdkDocModule[],
): string {
  const exportRows = moduleDoc.exports.map((item) => renderExportIndexRow(moduleDoc, item));
  const exportDetails = moduleDoc.exports.map((item) => renderExportDetails(item)).join("\n");

  return [
    "---",
    `title: "${moduleDoc.importSpecifier}"`,
    `summary: "${moduleDoc.summary.replaceAll('"', '\\"')}"`,
    "---",
    "",
    `# \`${moduleDoc.importSpecifier}\``,
    "",
    moduleDoc.summary,
    "",
    "> This page is auto-generated from the TypeScript interface. This module is",
    `> currently classified as \`${moduleDoc.stability}\`.`,
    "",
    "## Import",
    "",
    "```ts",
    `import { ... } from "${moduleDoc.importSpecifier}";`,
    "```",
    "",
    "## Module facts",
    "",
    `- Category: \`${moduleDoc.category}\``,
    `- Stability: \`${moduleDoc.stability}\``,
    `- Module source: ${renderSourceLink(moduleDoc.source.path, moduleDoc.source)}`,
    "",
    "## Export index",
    "",
    "| Export | Kind | Summary |",
    "| ------ | ---- | ------- |",
    ...exportRows,
    "",
    "## API",
    "",
    exportDetails,
    renderRelatedModules(moduleDoc, modules),
    "## Generated from",
    "",
    `- \`scripts/generate-plugin-sdk-docs.ts\``,
    `- \`${path.posix.normalize(moduleDoc.source.path)}\``,
    "",
  ].join("\n");
}

const categoryDescriptions: Record<PluginSdkDocCategoryIndex["category"], string> = {
  channel:
    "Generated index for the current channel-focused Plugin SDK modules used for setup, pairing, reply, auth, and webhook flows.",
  core: "Generated index for the core Plugin SDK entry surfaces plugin authors reach for first.",
  legacy:
    "Generated index for compatibility-only Plugin SDK surfaces that remain documented for migration.",
  provider: "Generated index for provider-focused Plugin SDK modules in the current curated set.",
  runtime: "Generated index for runtime-focused Plugin SDK modules in the current curated set.",
  utilities: "Generated index for utility-focused Plugin SDK modules in the current curated set.",
};

export function renderPluginSdkCategoryDoc(categoryIndex: PluginSdkDocCategoryIndex): string {
  const label = pluginSdkDocCategoryLabels[categoryIndex.category];
  const rows = categoryIndex.modules.map((moduleDoc) => {
    return `| [\`${moduleDoc.importSpecifier}\`](${moduleDoc.route}) | \`${moduleDoc.stability}\` | ${escapeTableCell(moduleDoc.summary)} |`;
  });

  const note =
    categoryIndex.category === "legacy"
      ? "These modules are still kept for migration, but they are also explicitly unstable."
      : "Every module listed here is currently unstable until OpenClaw makes an explicit compatibility promise.";

  return [
    "---",
    `title: "Plugin SDK ${label}"`,
    `sidebarTitle: "${label}"`,
    `summary: "${categoryDescriptions[categoryIndex.category].replaceAll('"', '\\"')}"`,
    "---",
    "",
    `# Plugin SDK ${label.toLowerCase()}`,
    "",
    categoryDescriptions[categoryIndex.category],
    "",
    `> ${note}`,
    "",
    "## Modules",
    "",
    "| Import path | Stability | Summary |",
    "| ----------- | --------- | ------- |",
    ...rows,
    "",
    "## Generated from",
    "",
    "- `scripts/lib/plugin-sdk-doc-metadata.ts`",
    "- `scripts/generate-plugin-sdk-docs.ts`",
    "",
  ].join("\n");
}

export function renderPluginSdkAllModulesDoc(modules: PluginSdkDocModule[]): string {
  const rows = modules.map((moduleDoc) => {
    return `| [\`${moduleDoc.importSpecifier}\`](${moduleDoc.route}) | ${pluginSdkDocCategoryLabels[moduleDoc.category]} | \`${moduleDoc.stability}\` | ${escapeTableCell(moduleDoc.summary)} |`;
  });

  return [
    "---",
    'title: "Plugin SDK Modules"',
    'sidebarTitle: "All Modules"',
    'summary: "Generated index of the current curated Plugin SDK module set"',
    "---",
    "",
    "# Plugin SDK modules",
    "",
    "This page is auto-generated from the current curated Plugin SDK metadata and",
    "the TypeScript export surface. Every listed module is currently classified as",
    "`unstable`.",
    "",
    "## Current module set",
    "",
    "| Import path | Category | Stability | Summary |",
    "| ----------- | -------- | --------- | ------- |",
    ...rows,
    "",
    "## Generated from",
    "",
    "- `scripts/lib/plugin-sdk-doc-metadata.ts`",
    "- `scripts/generate-plugin-sdk-docs.ts`",
    "",
  ].join("\n");
}
