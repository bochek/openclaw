import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatGeneratedModule } from "./lib/format-generated-module.mjs";
import { writeTextFileIfChanged } from "./runtime-postbuild-shared.mjs";

const GENERATED_BY = "scripts/generate-bundled-plugin-metadata.mjs";
const DEFAULT_OUTPUT_PATH = "src/plugins/bundled-plugin-metadata.generated.ts";
const MANIFEST_KEY = "openclaw";
const FORMATTER_CWD = path.resolve(import.meta.dirname, "..");
const CANONICAL_PACKAGE_ID_ALIASES = {
  "elevenlabs-speech": "elevenlabs",
  "microsoft-speech": "microsoft",
  "ollama-provider": "ollama",
  "sglang-provider": "sglang",
  "vllm-provider": "vllm",
};
const LOCALE_ID_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function rewriteEntryToBuiltPath(entry) {
  if (typeof entry !== "string" || entry.trim().length === 0) {
    return undefined;
  }
  const normalized = entry.replace(/^\.\//u, "");
  return normalized.replace(/\.[^.]+$/u, ".js");
}

function deriveIdHint({ filePath, packageName, hasMultipleExtensions }) {
  const base = path.basename(filePath, path.extname(filePath));
  const rawPackageName = packageName?.trim();
  if (!rawPackageName) {
    return base;
  }

  const unscoped = rawPackageName.includes("/")
    ? (rawPackageName.split("/").pop() ?? rawPackageName)
    : rawPackageName;
  const canonicalPackageId = CANONICAL_PACKAGE_ID_ALIASES[unscoped] ?? unscoped;
  const normalizedPackageId =
    canonicalPackageId.endsWith("-provider") && canonicalPackageId.length > "-provider".length
      ? canonicalPackageId.slice(0, -"-provider".length)
      : canonicalPackageId;

  if (!hasMultipleExtensions) {
    return normalizedPackageId;
  }
  return `${normalizedPackageId}/${base}`;
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const normalized = values.map((value) => String(value).trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseLocalizationCoverage(value, fieldLabel) {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  if (value === "full" || value === "partial") {
    return { ok: true, present: true, value };
  }
  return { ok: false, error: `${fieldLabel} must be "full" or "partial"` };
}

function parseLocalizationDocsResource(value) {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  const docs = normalizeObject(value);
  if (!docs) {
    return { ok: false, error: "localization.docs must be an object" };
  }
  const root = normalizeOptionalString(docs.root);
  if (!root) {
    return { ok: false, error: "localization.docs.root is required" };
  }
  const navPath = normalizeOptionalString(docs.navPath);
  if (!navPath) {
    return { ok: false, error: "localization.docs.navPath is required" };
  }
  const coverage = parseLocalizationCoverage(docs.coverage, "localization.docs.coverage");
  if (!coverage.ok) {
    return coverage;
  }
  const schemaVersion = normalizeOptionalString(docs.schemaVersion);
  if (docs.schemaVersion !== undefined && !schemaVersion) {
    return { ok: false, error: "localization.docs.schemaVersion must be a non-empty string" };
  }
  return {
    ok: true,
    present: true,
    value: {
      root,
      navPath,
      ...(schemaVersion ? { schemaVersion } : {}),
      ...(coverage.present ? { coverage: coverage.value } : {}),
    },
  };
}

function parseLocalizationControlUiResource(value) {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  const controlUi = normalizeObject(value);
  if (!controlUi) {
    return { ok: false, error: "localization.controlUi must be an object" };
  }
  const translationPath = normalizeOptionalString(controlUi.translationPath);
  if (!translationPath) {
    return { ok: false, error: "localization.controlUi.translationPath is required" };
  }
  const coverage = parseLocalizationCoverage(controlUi.coverage, "localization.controlUi.coverage");
  if (!coverage.ok) {
    return coverage;
  }
  const schemaVersion = normalizeOptionalString(controlUi.schemaVersion);
  if (controlUi.schemaVersion !== undefined && !schemaVersion) {
    return {
      ok: false,
      error: "localization.controlUi.schemaVersion must be a non-empty string",
    };
  }
  return {
    ok: true,
    present: true,
    value: {
      translationPath,
      ...(schemaVersion ? { schemaVersion } : {}),
      ...(coverage.present ? { coverage: coverage.value } : {}),
    },
  };
}

function parseLocalizationRuntimeResource(value) {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  const runtime = normalizeObject(value);
  if (!runtime) {
    return { ok: false, error: "localization.runtime must be an object" };
  }
  const catalogPath = normalizeOptionalString(runtime.catalogPath);
  if (!catalogPath) {
    return { ok: false, error: "localization.runtime.catalogPath is required" };
  }
  const coverage = parseLocalizationCoverage(runtime.coverage, "localization.runtime.coverage");
  if (!coverage.ok) {
    return coverage;
  }
  const schemaVersion = normalizeOptionalString(runtime.schemaVersion);
  if (runtime.schemaVersion !== undefined && !schemaVersion) {
    return { ok: false, error: "localization.runtime.schemaVersion must be a non-empty string" };
  }
  return {
    ok: true,
    present: true,
    value: {
      catalogPath,
      ...(schemaVersion ? { schemaVersion } : {}),
      ...(coverage.present ? { coverage: coverage.value } : {}),
    },
  };
}

function parseLocalizationMetaResource(value) {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  const meta = normalizeObject(value);
  if (!meta) {
    return { ok: false, error: "localization.meta must be an object" };
  }
  const glossaryPath = normalizeOptionalString(meta.glossaryPath);
  if (meta.glossaryPath !== undefined && !glossaryPath) {
    return { ok: false, error: "localization.meta.glossaryPath must be a non-empty string" };
  }
  const provenancePath = normalizeOptionalString(meta.provenancePath);
  if (meta.provenancePath !== undefined && !provenancePath) {
    return { ok: false, error: "localization.meta.provenancePath must be a non-empty string" };
  }
  const sourceManifestPath = normalizeOptionalString(meta.sourceManifestPath);
  if (meta.sourceManifestPath !== undefined && !sourceManifestPath) {
    return {
      ok: false,
      error: "localization.meta.sourceManifestPath must be a non-empty string",
    };
  }
  if (!glossaryPath && !provenancePath && !sourceManifestPath) {
    return { ok: false, error: "localization.meta must define at least one metadata path" };
  }
  return {
    ok: true,
    present: true,
    value: {
      ...(glossaryPath ? { glossaryPath } : {}),
      ...(provenancePath ? { provenancePath } : {}),
      ...(sourceManifestPath ? { sourceManifestPath } : {}),
    },
  };
}

function normalizeLocalizationManifest(value) {
  const localization = normalizeObject(value);
  if (!localization) {
    return undefined;
  }

  const locale = normalizeOptionalString(localization.locale);
  if (!locale || !LOCALE_ID_RE.test(locale)) {
    return undefined;
  }

  const docs = parseLocalizationDocsResource(localization.docs);
  if (!docs.ok) {
    throw new Error(`invalid localization.docs: ${docs.error}`);
  }
  const controlUi = parseLocalizationControlUiResource(localization.controlUi);
  if (!controlUi.ok) {
    throw new Error(`invalid localization.controlUi: ${controlUi.error}`);
  }
  const runtime = parseLocalizationRuntimeResource(localization.runtime);
  if (!runtime.ok) {
    throw new Error(`invalid localization.runtime: ${runtime.error}`);
  }
  const meta = parseLocalizationMetaResource(localization.meta);
  if (!meta.ok) {
    throw new Error(`invalid localization.meta: ${meta.error}`);
  }
  if (!docs.present && !controlUi.present && !runtime.present && !meta.present) {
    return undefined;
  }

  let compatibility;
  if (localization.compatibility !== undefined) {
    const compatibilityObject = normalizeObject(localization.compatibility);
    if (!compatibilityObject) {
      throw new Error("invalid localization.compatibility: must be an object");
    }
    const minOpenClawVersion = normalizeOptionalString(compatibilityObject.minOpenClawVersion);
    if (compatibilityObject.minOpenClawVersion !== undefined && !minOpenClawVersion) {
      throw new Error(
        "invalid localization.compatibility: minOpenClawVersion must be a non-empty string",
      );
    }
    compatibility = minOpenClawVersion ? { minOpenClawVersion } : undefined;
  }

  return {
    locale,
    ...(docs.present ? { docs: docs.value } : {}),
    ...(controlUi.present ? { controlUi: controlUi.value } : {}),
    ...(runtime.present ? { runtime: runtime.value } : {}),
    ...(meta.present ? { meta: meta.value } : {}),
    ...(compatibility ? { compatibility } : {}),
  };
}

function normalizePackageManifest(raw) {
  const packageManifest = normalizeObject(raw?.[MANIFEST_KEY]);
  if (!packageManifest) {
    return undefined;
  }
  const normalized = {
    ...(packageManifest.packageMode === "runtime-plugin" ||
    packageManifest.packageMode === "resource-only"
      ? { packageMode: packageManifest.packageMode }
      : {}),
    ...(Array.isArray(packageManifest.extensions)
      ? { extensions: packageManifest.extensions.map((entry) => String(entry).trim()) }
      : {}),
    ...(typeof packageManifest.setupEntry === "string"
      ? { setupEntry: packageManifest.setupEntry.trim() }
      : {}),
    ...(normalizeObject(packageManifest.channel) ? { channel: packageManifest.channel } : {}),
    ...(normalizeObject(packageManifest.install) ? { install: packageManifest.install } : {}),
    ...(normalizeObject(packageManifest.startup) ? { startup: packageManifest.startup } : {}),
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizePluginManifest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  if (typeof raw.id !== "string" || !raw.id.trim()) {
    return null;
  }
  if (
    !raw.configSchema ||
    typeof raw.configSchema !== "object" ||
    Array.isArray(raw.configSchema)
  ) {
    return null;
  }

  return {
    id: raw.id.trim(),
    configSchema: raw.configSchema,
    ...(raw.enabledByDefault === true ? { enabledByDefault: true } : {}),
    ...(typeof raw.kind === "string" ? { kind: raw.kind.trim() } : {}),
    ...(normalizeStringList(raw.channels) ? { channels: normalizeStringList(raw.channels) } : {}),
    ...(normalizeStringList(raw.providers)
      ? { providers: normalizeStringList(raw.providers) }
      : {}),
    ...(normalizeObject(raw.providerAuthEnvVars)
      ? { providerAuthEnvVars: raw.providerAuthEnvVars }
      : {}),
    ...(Array.isArray(raw.providerAuthChoices)
      ? { providerAuthChoices: raw.providerAuthChoices }
      : {}),
    ...(normalizeStringList(raw.skills) ? { skills: normalizeStringList(raw.skills) } : {}),
    ...(normalizeLocalizationManifest(raw.localization)
      ? { localization: normalizeLocalizationManifest(raw.localization) }
      : {}),
    ...(typeof raw.name === "string" ? { name: raw.name.trim() } : {}),
    ...(typeof raw.description === "string" ? { description: raw.description.trim() } : {}),
    ...(typeof raw.version === "string" ? { version: raw.version.trim() } : {}),
    ...(normalizeObject(raw.uiHints) ? { uiHints: raw.uiHints } : {}),
  };
}

function formatTypeScriptModule(source, { outputPath }) {
  return formatGeneratedModule(source, {
    repoRoot: FORMATTER_CWD,
    outputPath,
    errorLabel: "bundled plugin metadata",
  });
}

export function collectBundledPluginMetadata(params = {}) {
  const repoRoot = path.resolve(params.repoRoot ?? process.cwd());
  const extensionsRoot = path.join(repoRoot, "extensions");
  if (!fs.existsSync(extensionsRoot)) {
    return [];
  }

  const entries = [];
  for (const dirent of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }

    const pluginDir = path.join(extensionsRoot, dirent.name);
    const manifestPath = path.join(pluginDir, "openclaw.plugin.json");
    const packageJsonPath = path.join(pluginDir, "package.json");
    if (!fs.existsSync(manifestPath) || !fs.existsSync(packageJsonPath)) {
      continue;
    }

    const manifest = normalizePluginManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
    if (!manifest) {
      continue;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const packageManifest = normalizePackageManifest(packageJson);
    const packageMode =
      packageManifest?.packageMode === "resource-only" ? "resource-only" : "runtime-plugin";
    const extensions = Array.isArray(packageManifest?.extensions)
      ? packageManifest.extensions.filter((entry) => typeof entry === "string" && entry.trim())
      : [];
    const sourceEntry = extensions[0];
    const builtEntry = sourceEntry ? rewriteEntryToBuiltPath(sourceEntry) : undefined;
    if (packageMode === "runtime-plugin" && (!sourceEntry || !builtEntry)) {
      continue;
    }
    const setupEntry =
      typeof packageManifest?.setupEntry === "string" &&
      packageManifest.setupEntry.trim().length > 0
        ? {
            source: packageManifest.setupEntry.trim(),
            built: rewriteEntryToBuiltPath(packageManifest.setupEntry.trim()),
          }
        : undefined;

    entries.push({
      dirName: dirent.name,
      idHint:
        packageMode === "resource-only"
          ? manifest.id
          : deriveIdHint({
              filePath: sourceEntry,
              packageName: typeof packageJson.name === "string" ? packageJson.name : undefined,
              hasMultipleExtensions: extensions.length > 1,
            }),
      ...(sourceEntry && builtEntry
        ? {
            source: {
              source: sourceEntry,
              built: builtEntry,
            },
          }
        : {}),
      ...(setupEntry?.built
        ? { setupSource: { source: setupEntry.source, built: setupEntry.built } }
        : {}),
      ...(typeof packageJson.name === "string" ? { packageName: packageJson.name.trim() } : {}),
      ...(typeof packageJson.version === "string"
        ? { packageVersion: packageJson.version.trim() }
        : {}),
      ...(typeof packageJson.description === "string"
        ? { packageDescription: packageJson.description.trim() }
        : {}),
      ...(packageManifest ? { packageManifest } : {}),
      manifest,
    });
  }

  return entries.toSorted((left, right) => left.dirName.localeCompare(right.dirName));
}

export function renderBundledPluginMetadataModule(entries) {
  return `// Auto-generated by ${GENERATED_BY}. Do not edit directly.

export const GENERATED_BUNDLED_PLUGIN_METADATA = ${JSON.stringify(entries, null, 2)} as const;
`;
}

export function writeBundledPluginMetadataModule(params = {}) {
  const repoRoot = path.resolve(params.repoRoot ?? process.cwd());
  const outputPath = path.resolve(repoRoot, params.outputPath ?? DEFAULT_OUTPUT_PATH);
  const next = formatTypeScriptModule(
    renderBundledPluginMetadataModule(collectBundledPluginMetadata({ repoRoot })),
    { outputPath },
  );
  const current = readIfExists(outputPath);
  const changed = current !== next;

  if (params.check) {
    return {
      changed,
      wrote: false,
      outputPath,
    };
  }

  return {
    changed,
    wrote: writeTextFileIfChanged(outputPath, next),
    outputPath,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = writeBundledPluginMetadataModule({
    check: process.argv.includes("--check"),
  });

  if (result.changed) {
    if (process.argv.includes("--check")) {
      console.error(
        `[bundled-plugin-metadata] stale generated output at ${path.relative(process.cwd(), result.outputPath)}`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `[bundled-plugin-metadata] wrote ${path.relative(process.cwd(), result.outputPath)}`,
      );
    }
  }
}
