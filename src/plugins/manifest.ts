import fs from "node:fs";
import path from "node:path";
import { MANIFEST_KEY } from "../compat/legacy-names.js";
import { matchBoundaryFileOpenFailure, openBoundaryFileSync } from "../infra/boundary-file-read.js";
import { isRecord } from "../utils.js";
import type { PluginConfigUiHint, PluginKind } from "./types.js";

export const PLUGIN_MANIFEST_FILENAME = "openclaw.plugin.json";
export const PLUGIN_MANIFEST_FILENAMES = [PLUGIN_MANIFEST_FILENAME] as const;

export type PluginLocalizationCoverage = "full" | "partial";
export type OpenClawPackageMode = "runtime-plugin" | "resource-only";

const LOCALE_ID_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function isValidLocaleId(value: string): boolean {
  return LOCALE_ID_RE.test(value);
}

export type PluginLocalizationDocsResource = {
  root: string;
  navPath: string;
  schemaVersion?: string;
  coverage?: PluginLocalizationCoverage;
};

export type PluginLocalizationControlUiResource = {
  translationPath: string;
  schemaVersion?: string;
  coverage?: PluginLocalizationCoverage;
};

export type PluginLocalizationRuntimeResource = {
  catalogPath: string;
  schemaVersion?: string;
  coverage?: PluginLocalizationCoverage;
};

export type PluginLocalizationMetaResource = {
  glossaryPath?: string;
  provenancePath?: string;
  sourceManifestPath?: string;
};

export type PluginLocalizationManifest = {
  locale: string;
  docs?: PluginLocalizationDocsResource;
  controlUi?: PluginLocalizationControlUiResource;
  runtime?: PluginLocalizationRuntimeResource;
  meta?: PluginLocalizationMetaResource;
  compatibility?: {
    minOpenClawVersion?: string;
  };
};

export type PluginManifest = {
  id: string;
  configSchema: Record<string, unknown>;
  enabledByDefault?: boolean;
  kind?: PluginKind;
  channels?: string[];
  providers?: string[];
  /** Cheap provider-auth env lookup without booting plugin runtime. */
  providerAuthEnvVars?: Record<string, string[]>;
  /**
   * Cheap onboarding/auth-choice metadata used by config validation, CLI help,
   * and non-runtime auth-choice routing before provider runtime loads.
   */
  providerAuthChoices?: PluginManifestProviderAuthChoice[];
  skills?: string[];
  localization?: PluginLocalizationManifest;
  name?: string;
  description?: string;
  version?: string;
  uiHints?: Record<string, PluginConfigUiHint>;
};

export type PluginManifestProviderAuthChoice = {
  /** Provider id owned by this manifest entry. */
  provider: string;
  /** Provider auth method id that this choice should dispatch to. */
  method: string;
  /** Stable auth-choice id used by onboarding and other CLI auth flows. */
  choiceId: string;
  /** Optional user-facing choice label/hint for grouped onboarding UI. */
  choiceLabel?: string;
  choiceHint?: string;
  /** Optional grouping metadata for auth-choice pickers. */
  groupId?: string;
  groupLabel?: string;
  groupHint?: string;
  /** Optional CLI flag metadata for one-flag auth flows such as API keys. */
  optionKey?: string;
  cliFlag?: string;
  cliOption?: string;
  cliDescription?: string;
  /**
   * Interactive onboarding surfaces where this auth choice should appear.
   * Defaults to `["text-inference"]` when omitted.
   */
  onboardingScopes?: PluginManifestOnboardingScope[];
};

export type PluginManifestOnboardingScope = "text-inference" | "image-generation";

export type PluginManifestLoadResult =
  | { ok: true; manifest: PluginManifest; manifestPath: string }
  | { ok: false; error: string; manifestPath: string };

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

function normalizeStringListRecord(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const normalized: Record<string, string[]> = {};
  for (const [key, rawValues] of Object.entries(value)) {
    const providerId = typeof key === "string" ? key.trim() : "";
    if (!providerId) {
      continue;
    }
    const values = normalizeStringList(rawValues);
    if (values.length === 0) {
      continue;
    }
    normalized[providerId] = values;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeProviderAuthChoices(
  value: unknown,
): PluginManifestProviderAuthChoice[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized: PluginManifestProviderAuthChoice[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const provider = typeof entry.provider === "string" ? entry.provider.trim() : "";
    const method = typeof entry.method === "string" ? entry.method.trim() : "";
    const choiceId = typeof entry.choiceId === "string" ? entry.choiceId.trim() : "";
    if (!provider || !method || !choiceId) {
      continue;
    }
    const choiceLabel = typeof entry.choiceLabel === "string" ? entry.choiceLabel.trim() : "";
    const choiceHint = typeof entry.choiceHint === "string" ? entry.choiceHint.trim() : "";
    const groupId = typeof entry.groupId === "string" ? entry.groupId.trim() : "";
    const groupLabel = typeof entry.groupLabel === "string" ? entry.groupLabel.trim() : "";
    const groupHint = typeof entry.groupHint === "string" ? entry.groupHint.trim() : "";
    const optionKey = typeof entry.optionKey === "string" ? entry.optionKey.trim() : "";
    const cliFlag = typeof entry.cliFlag === "string" ? entry.cliFlag.trim() : "";
    const cliOption = typeof entry.cliOption === "string" ? entry.cliOption.trim() : "";
    const cliDescription =
      typeof entry.cliDescription === "string" ? entry.cliDescription.trim() : "";
    const onboardingScopes = normalizeStringList(entry.onboardingScopes).filter(
      (scope): scope is PluginManifestOnboardingScope =>
        scope === "text-inference" || scope === "image-generation",
    );
    normalized.push({
      provider,
      method,
      choiceId,
      ...(choiceLabel ? { choiceLabel } : {}),
      ...(choiceHint ? { choiceHint } : {}),
      ...(groupId ? { groupId } : {}),
      ...(groupLabel ? { groupLabel } : {}),
      ...(groupHint ? { groupHint } : {}),
      ...(optionKey ? { optionKey } : {}),
      ...(cliFlag ? { cliFlag } : {}),
      ...(cliOption ? { cliOption } : {}),
      ...(cliDescription ? { cliDescription } : {}),
      ...(onboardingScopes.length > 0 ? { onboardingScopes } : {}),
    });
  }
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : undefined;
}

type LocalizationParseResult<T> =
  | { ok: true; present: false }
  | { ok: true; present: true; value: T }
  | { ok: false; error: string };

function parseLocalizationCoverage(
  value: unknown,
  fieldLabel: string,
): LocalizationParseResult<PluginLocalizationCoverage> {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  if (value === "full" || value === "partial") {
    return { ok: true, present: true, value };
  }
  return { ok: false, error: `${fieldLabel} must be "full" or "partial"` };
}

function parseLocalizationDocsResource(
  value: unknown,
): LocalizationParseResult<PluginLocalizationDocsResource> {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  if (!isRecord(value)) {
    return { ok: false, error: "localization.docs must be an object" };
  }
  const root = normalizeOptionalString(value.root);
  if (!root) {
    return { ok: false, error: "localization.docs.root is required" };
  }
  const navPath = normalizeOptionalString(value.navPath);
  if (!navPath) {
    return { ok: false, error: "localization.docs.navPath is required" };
  }
  const coverage = parseLocalizationCoverage(value.coverage, "localization.docs.coverage");
  if (!coverage.ok) {
    return coverage;
  }
  const schemaVersion = normalizeOptionalString(value.schemaVersion);
  if (value.schemaVersion !== undefined && !schemaVersion) {
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

function parseLocalizationControlUiResource(
  value: unknown,
): LocalizationParseResult<PluginLocalizationControlUiResource> {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  if (!isRecord(value)) {
    return { ok: false, error: "localization.controlUi must be an object" };
  }
  const translationPath = normalizeOptionalString(value.translationPath);
  if (!translationPath) {
    return { ok: false, error: "localization.controlUi.translationPath is required" };
  }
  const coverage = parseLocalizationCoverage(value.coverage, "localization.controlUi.coverage");
  if (!coverage.ok) {
    return coverage;
  }
  const schemaVersion = normalizeOptionalString(value.schemaVersion);
  if (value.schemaVersion !== undefined && !schemaVersion) {
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

function parseLocalizationRuntimeResource(
  value: unknown,
): LocalizationParseResult<PluginLocalizationRuntimeResource> {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  if (!isRecord(value)) {
    return { ok: false, error: "localization.runtime must be an object" };
  }
  const catalogPath = normalizeOptionalString(value.catalogPath);
  if (!catalogPath) {
    return { ok: false, error: "localization.runtime.catalogPath is required" };
  }
  const coverage = parseLocalizationCoverage(value.coverage, "localization.runtime.coverage");
  if (!coverage.ok) {
    return coverage;
  }
  const schemaVersion = normalizeOptionalString(value.schemaVersion);
  if (value.schemaVersion !== undefined && !schemaVersion) {
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

function parseLocalizationMetaResource(
  value: unknown,
): LocalizationParseResult<PluginLocalizationMetaResource> {
  if (value === undefined) {
    return { ok: true, present: false };
  }
  if (!isRecord(value)) {
    return { ok: false, error: "localization.meta must be an object" };
  }
  const glossaryPath = normalizeOptionalString(value.glossaryPath);
  if (value.glossaryPath !== undefined && !glossaryPath) {
    return { ok: false, error: "localization.meta.glossaryPath must be a non-empty string" };
  }
  const provenancePath = normalizeOptionalString(value.provenancePath);
  if (value.provenancePath !== undefined && !provenancePath) {
    return { ok: false, error: "localization.meta.provenancePath must be a non-empty string" };
  }
  const sourceManifestPath = normalizeOptionalString(value.sourceManifestPath);
  if (value.sourceManifestPath !== undefined && !sourceManifestPath) {
    return {
      ok: false,
      error: "localization.meta.sourceManifestPath must be a non-empty string",
    };
  }
  if (!glossaryPath && !provenancePath && !sourceManifestPath) {
    return {
      ok: false,
      error: "localization.meta must define at least one metadata path",
    };
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

function normalizeLocalizationManifest(value: unknown): PluginLocalizationManifest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const locale = typeof value.locale === "string" ? value.locale.trim() : "";
  if (!locale || !isValidLocaleId(locale)) {
    return undefined;
  }

  const docs = parseLocalizationDocsResource(value.docs);
  if (!docs.ok) {
    return undefined;
  }
  const controlUi = parseLocalizationControlUiResource(value.controlUi);
  if (!controlUi.ok) {
    return undefined;
  }
  const runtime = parseLocalizationRuntimeResource(value.runtime);
  if (!runtime.ok) {
    return undefined;
  }
  const meta = parseLocalizationMetaResource(value.meta);
  if (!meta.ok) {
    return undefined;
  }
  if (!docs.present && !controlUi.present && !runtime.present && !meta.present) {
    return undefined;
  }

  const compatibility = (() => {
    if (value.compatibility === undefined) {
      return undefined;
    }
    if (!isRecord(value.compatibility)) {
      return null;
    }
    const minOpenClawVersion = normalizeOptionalString(value.compatibility.minOpenClawVersion);
    if (value.compatibility.minOpenClawVersion !== undefined && !minOpenClawVersion) {
      return null;
    }
    return minOpenClawVersion ? { minOpenClawVersion } : undefined;
  })();
  if (compatibility === null) {
    return undefined;
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

export function resolvePluginManifestPath(rootDir: string): string {
  for (const filename of PLUGIN_MANIFEST_FILENAMES) {
    const candidate = path.join(rootDir, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(rootDir, PLUGIN_MANIFEST_FILENAME);
}

export function loadPluginManifest(
  rootDir: string,
  rejectHardlinks = true,
): PluginManifestLoadResult {
  const manifestPath = resolvePluginManifestPath(rootDir);
  const opened = openBoundaryFileSync({
    absolutePath: manifestPath,
    rootPath: rootDir,
    boundaryLabel: "plugin root",
    rejectHardlinks,
  });
  if (!opened.ok) {
    return matchBoundaryFileOpenFailure(opened, {
      path: () => ({
        ok: false,
        error: `plugin manifest not found: ${manifestPath}`,
        manifestPath,
      }),
      fallback: (failure) => ({
        ok: false,
        error: `unsafe plugin manifest path: ${manifestPath} (${failure.reason})`,
        manifestPath,
      }),
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(opened.fd, "utf-8")) as unknown;
  } catch (err) {
    return {
      ok: false,
      error: `failed to parse plugin manifest: ${String(err)}`,
      manifestPath,
    };
  } finally {
    fs.closeSync(opened.fd);
  }
  if (!isRecord(raw)) {
    return { ok: false, error: "plugin manifest must be an object", manifestPath };
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    return { ok: false, error: "plugin manifest requires id", manifestPath };
  }
  const configSchema = isRecord(raw.configSchema) ? raw.configSchema : null;
  if (!configSchema) {
    return { ok: false, error: "plugin manifest requires configSchema", manifestPath };
  }

  const kind = typeof raw.kind === "string" ? (raw.kind as PluginKind) : undefined;
  const enabledByDefault = raw.enabledByDefault === true;
  const name = typeof raw.name === "string" ? raw.name.trim() : undefined;
  const description = typeof raw.description === "string" ? raw.description.trim() : undefined;
  const version = typeof raw.version === "string" ? raw.version.trim() : undefined;
  const channels = normalizeStringList(raw.channels);
  const providers = normalizeStringList(raw.providers);
  const providerAuthEnvVars = normalizeStringListRecord(raw.providerAuthEnvVars);
  const providerAuthChoices = normalizeProviderAuthChoices(raw.providerAuthChoices);
  const skills = normalizeStringList(raw.skills);
  const localization = normalizeLocalizationManifest(raw.localization);
  if (raw.localization !== undefined && !localization) {
    return {
      ok: false,
      error: "plugin manifest localization block is invalid",
      manifestPath,
    };
  }

  let uiHints: Record<string, PluginConfigUiHint> | undefined;
  if (isRecord(raw.uiHints)) {
    uiHints = raw.uiHints as Record<string, PluginConfigUiHint>;
  }

  return {
    ok: true,
    manifest: {
      id,
      configSchema,
      ...(enabledByDefault ? { enabledByDefault } : {}),
      kind,
      channels,
      providers,
      providerAuthEnvVars,
      providerAuthChoices,
      skills,
      localization,
      name,
      description,
      version,
      uiHints,
    },
    manifestPath,
  };
}

// package.json "openclaw" metadata (used for setup/catalog)
export type PluginPackageChannel = {
  id?: string;
  label?: string;
  selectionLabel?: string;
  detailLabel?: string;
  docsPath?: string;
  docsLabel?: string;
  blurb?: string;
  order?: number;
  aliases?: string[];
  preferOver?: string[];
  systemImage?: string;
  selectionDocsPrefix?: string;
  selectionDocsOmitLabel?: boolean;
  selectionExtras?: string[];
  showConfigured?: boolean;
  quickstartAllowFrom?: boolean;
  forceAccountBinding?: boolean;
  preferSessionLookupForAnnounceTarget?: boolean;
};

export type PluginPackageInstall = {
  npmSpec?: string;
  localPath?: string;
  defaultChoice?: "npm" | "local";
  minHostVersion?: string;
};

export type OpenClawPackageStartup = {
  /**
   * Opt-in for channel plugins whose `setupEntry` fully covers the gateway
   * startup surface needed before the server starts listening.
   */
  deferConfiguredChannelFullLoadUntilAfterListen?: boolean;
};

export type OpenClawPackageManifest = {
  packageMode?: OpenClawPackageMode;
  extensions?: string[];
  setupEntry?: string;
  channel?: PluginPackageChannel;
  install?: PluginPackageInstall;
  startup?: OpenClawPackageStartup;
};

export const DEFAULT_PLUGIN_ENTRY_CANDIDATES = [
  "index.ts",
  "index.js",
  "index.mjs",
  "index.cjs",
] as const;

export type PackageExtensionResolution =
  | { status: "ok"; entries: string[] }
  | { status: "missing"; entries: [] }
  | { status: "empty"; entries: [] };

export type ManifestKey = typeof MANIFEST_KEY;

export type PackageManifest = {
  name?: string;
  version?: string;
  description?: string;
} & Partial<Record<ManifestKey, OpenClawPackageManifest>>;

export function getPackageManifestMetadata(
  manifest: PackageManifest | undefined,
): OpenClawPackageManifest | undefined {
  if (!manifest) {
    return undefined;
  }
  return manifest[MANIFEST_KEY];
}

function isOpenClawPackageManifest(value: unknown): value is OpenClawPackageManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.packageMode === "runtime-plugin" ||
    record.packageMode === "resource-only" ||
    "extensions" in record ||
    "setupEntry" in record ||
    "channel" in record ||
    "install" in record ||
    "startup" in record
  );
}

export function resolvePackageMode(
  manifest: PackageManifest | OpenClawPackageManifest | undefined,
): OpenClawPackageMode {
  if (!manifest) {
    return "runtime-plugin";
  }
  const record = manifest as Record<string, unknown>;
  const packageManifest =
    MANIFEST_KEY in record
      ? getPackageManifestMetadata(manifest as PackageManifest)
      : isOpenClawPackageManifest(manifest)
        ? manifest
        : undefined;
  return packageManifest?.packageMode === "resource-only" ? "resource-only" : "runtime-plugin";
}

export function resolvePackageExtensionEntries(
  manifest: PackageManifest | undefined,
): PackageExtensionResolution {
  const raw = getPackageManifestMetadata(manifest)?.extensions;
  if (!Array.isArray(raw)) {
    return { status: "missing", entries: [] };
  }
  const entries = raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  if (entries.length === 0) {
    return { status: "empty", entries: [] };
  }
  return { status: "ok", entries };
}
