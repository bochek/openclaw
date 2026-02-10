import { buildConfigSchema, type ConfigUiHint } from "@openclaw/config/schema.ts";

type JsonSchemaNode = {
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
};

export type ExplorerField = {
  path: string;
  label: string;
  help: string;
  sensitive: boolean;
  advanced: boolean;
};

export type ExplorerSection = {
  id: string;
  label: string;
  order: number;
  description: string;
  fields: ExplorerField[];
};

export type ExplorerSnapshot = {
  version: string;
  generatedAt: string;
  sectionCount: number;
  fieldCount: number;
  sections: ExplorerSection[];
};

const SECTION_FALLBACK_ORDER = 500;

function humanizeKey(value: string): string {
  if (!value.trim()) {
    return value;
  }
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function firstPathSegment(path: string): string {
  const [segment] = path.split(".");
  return segment?.trim() ?? "";
}

function lastPathSegment(path: string): string {
  const segments = path.split(".");
  return segments.at(-1) ?? path;
}

function isSectionHint(path: string, hint: ConfigUiHint): boolean {
  return !path.includes(".") && typeof hint.order === "number" && typeof hint.group === "string";
}

function fieldSort(a: ExplorerField, b: ExplorerField): number {
  return a.path.localeCompare(b.path);
}

function sectionSort(a: ExplorerSection, b: ExplorerSection): number {
  if (a.order !== b.order) {
    return a.order - b.order;
  }
  return a.label.localeCompare(b.label);
}

export function buildExplorerSnapshot(): ExplorerSnapshot {
  const configSchema = buildConfigSchema();
  const uiHints = configSchema.uiHints;
  const schemaRoot = (configSchema.schema as JsonSchemaNode).properties ?? {};

  const sections = new Map<string, ExplorerSection>();

  for (const [path, hint] of Object.entries(uiHints)) {
    if (!isSectionHint(path, hint)) {
      continue;
    }
    sections.set(path, {
      id: path,
      label: hint.label?.trim() || hint.group?.trim() || humanizeKey(path),
      order: hint.order,
      description: "",
      fields: [],
    });
  }

  for (const [rootKey, node] of Object.entries(schemaRoot)) {
    if (sections.has(rootKey)) {
      const existing = sections.get(rootKey);
      if (existing) {
        existing.description = node.description?.trim() ?? existing.description;
      }
      continue;
    }
    const rootHint = uiHints[rootKey];
    sections.set(rootKey, {
      id: rootKey,
      label: rootHint?.label?.trim() || humanizeKey(rootKey),
      order: rootHint?.order ?? SECTION_FALLBACK_ORDER,
      description: node.description?.trim() ?? rootHint?.help?.trim() ?? "",
      fields: [],
    });
  }

  for (const [path, hint] of Object.entries(uiHints)) {
    const rootKey = firstPathSegment(path);
    if (!rootKey) {
      continue;
    }

    const section = sections.get(rootKey);
    if (!section) {
      sections.set(rootKey, {
        id: rootKey,
        label: humanizeKey(rootKey),
        order: SECTION_FALLBACK_ORDER,
        description: "",
        fields: [],
      });
    }

    const target = sections.get(rootKey);
    if (!target) {
      continue;
    }

    if (isSectionHint(path, hint)) {
      continue;
    }

    target.fields.push({
      path,
      label: hint.label?.trim() || humanizeKey(lastPathSegment(path)),
      help: hint.help?.trim() ?? "",
      sensitive: Boolean(hint.sensitive),
      advanced: Boolean(hint.advanced),
    });
  }

  const orderedSections = Array.from(sections.values())
    .map((section) => ({ ...section, fields: section.fields.toSorted(fieldSort) }))
    .toSorted(sectionSort);

  const fieldCount = orderedSections.reduce((sum, section) => sum + section.fields.length, 0);

  return {
    version: configSchema.version,
    generatedAt: configSchema.generatedAt,
    sectionCount: orderedSections.length,
    fieldCount,
    sections: orderedSections,
  };
}
