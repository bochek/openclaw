import type { OpenClawConfig } from "../config/config.js";
import { compareSemverStrings } from "../infra/update-check.js";
import type { PluginCandidate } from "../plugins/discovery.js";
import {
  loadPluginManifestRegistry,
  type PluginManifestRecord,
} from "../plugins/manifest-registry.js";
import { checkMinHostVersion } from "../plugins/min-host-version.js";
import type { PluginDiagnostic, PluginOrigin } from "../plugins/types.js";
import { resolveRuntimeServiceVersion } from "../version.js";

export type LocaleResourceKind = "docs" | "controlUi" | "runtime";

export type LocaleRegistryPackage = {
  pluginId: string;
  locale: string;
  origin: PluginOrigin;
  version?: string;
  rootDir: string;
  manifestPath: string;
  source: string;
  packageMode: PluginManifestRecord["packageMode"];
  resourceKinds: Array<LocaleResourceKind | "meta">;
  localization: NonNullable<PluginManifestRecord["localization"]>;
};

export type LocaleRegistryEntry = {
  key: string;
  pluginId: string;
  locale: string;
  kind: LocaleResourceKind;
  origin: PluginOrigin;
  version?: string;
  rootDir: string;
  manifestPath: string;
  source: string;
  packageMode: PluginManifestRecord["packageMode"];
  relativePath: string;
  schemaVersion?: string;
  coverage?: "full" | "partial";
  compatibility: {
    ok: boolean;
    reason?: string;
  };
};

export type LocaleRegistrySelection = {
  key: string;
  locale: string;
  kind: LocaleResourceKind;
  selected: LocaleRegistryEntry;
  shadowed: LocaleRegistryEntry[];
  selectionReason: "only-provider" | "compatibility" | "origin" | "version" | "id";
};

export type LocaleRegistryConflict = {
  key: string;
  locale: string;
  kind: LocaleResourceKind;
  selectedPluginId: string;
  shadowedPluginIds: string[];
  selectionReason: LocaleRegistrySelection["selectionReason"];
};

export type LocaleRegistry = {
  packages: LocaleRegistryPackage[];
  entries: LocaleRegistryEntry[];
  selections: LocaleRegistrySelection[];
  conflicts: LocaleRegistryConflict[];
  diagnostics: PluginDiagnostic[];
};

export type LoadLocaleRegistryOptions = {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  candidates?: PluginCandidate[];
};

const LOCALE_ORIGIN_RANK: Readonly<Record<PluginOrigin, number>> = {
  config: 0,
  workspace: 1,
  global: 2,
  bundled: 3,
};

function buildLocaleRegistryKey(locale: string, kind: LocaleResourceKind): string {
  return `${locale}::${kind}`;
}

function buildCompatibility(record: PluginManifestRecord, env: NodeJS.ProcessEnv) {
  const currentVersion = resolveRuntimeServiceVersion(env);
  const minOpenClawVersion = record.localization?.compatibility?.minOpenClawVersion;
  if (!minOpenClawVersion) {
    return { ok: true };
  }
  const result = checkMinHostVersion({
    currentVersion,
    minHostVersion: minOpenClawVersion,
  });
  if (result.ok) {
    return { ok: true };
  }
  if (result.kind === "invalid") {
    return { ok: false, reason: `invalid minOpenClawVersion: ${result.error}` };
  }
  if (result.kind === "unknown_host_version") {
    return {
      ok: false,
      reason: `requires OpenClaw >=${result.requirement.minimumLabel}, but host version could not be determined`,
    };
  }
  return {
    ok: false,
    reason: `requires OpenClaw >=${result.requirement.minimumLabel}, but host is ${result.currentVersion}`,
  };
}

function buildLocalePackage(record: PluginManifestRecord): LocaleRegistryPackage | null {
  if (!record.localization) {
    return null;
  }
  const resourceKinds: LocaleRegistryPackage["resourceKinds"] = [];
  if (record.localization.docs) {
    resourceKinds.push("docs");
  }
  if (record.localization.controlUi) {
    resourceKinds.push("controlUi");
  }
  if (record.localization.runtime) {
    resourceKinds.push("runtime");
  }
  if (record.localization.meta) {
    resourceKinds.push("meta");
  }
  return {
    pluginId: record.id,
    locale: record.localization.locale,
    origin: record.origin,
    version: record.version,
    rootDir: record.rootDir,
    manifestPath: record.manifestPath,
    source: record.source,
    packageMode: record.packageMode,
    resourceKinds,
    localization: record.localization,
  };
}

function buildLocaleEntries(
  record: PluginManifestRecord,
  env: NodeJS.ProcessEnv,
): LocaleRegistryEntry[] {
  if (!record.localization) {
    return [];
  }
  const compatibility = buildCompatibility(record, env);
  const base = {
    pluginId: record.id,
    locale: record.localization.locale,
    origin: record.origin,
    version: record.version,
    rootDir: record.rootDir,
    manifestPath: record.manifestPath,
    source: record.source,
    packageMode: record.packageMode,
    compatibility,
  };
  const entries: LocaleRegistryEntry[] = [];
  if (record.localization.docs) {
    entries.push({
      key: buildLocaleRegistryKey(record.localization.locale, "docs"),
      kind: "docs",
      relativePath: record.localization.docs.root,
      schemaVersion: record.localization.docs.schemaVersion,
      coverage: record.localization.docs.coverage,
      ...base,
    });
  }
  if (record.localization.controlUi) {
    entries.push({
      key: buildLocaleRegistryKey(record.localization.locale, "controlUi"),
      kind: "controlUi",
      relativePath: record.localization.controlUi.translationPath,
      schemaVersion: record.localization.controlUi.schemaVersion,
      coverage: record.localization.controlUi.coverage,
      ...base,
    });
  }
  if (record.localization.runtime) {
    entries.push({
      key: buildLocaleRegistryKey(record.localization.locale, "runtime"),
      kind: "runtime",
      relativePath: record.localization.runtime.catalogPath,
      schemaVersion: record.localization.runtime.schemaVersion,
      coverage: record.localization.runtime.coverage,
      ...base,
    });
  }
  return entries;
}

function compareLocaleEntries(left: LocaleRegistryEntry, right: LocaleRegistryEntry): number {
  const originRankDiff = LOCALE_ORIGIN_RANK[left.origin] - LOCALE_ORIGIN_RANK[right.origin];
  if (originRankDiff !== 0) {
    return originRankDiff;
  }
  if (left.compatibility.ok !== right.compatibility.ok) {
    return left.compatibility.ok ? -1 : 1;
  }
  const versionCmp = compareSemverStrings(left.version ?? null, right.version ?? null);
  if (versionCmp != null && versionCmp !== 0) {
    return versionCmp < 0 ? 1 : -1;
  }
  return left.pluginId.localeCompare(right.pluginId);
}

function determineSelectionReason(
  selected: LocaleRegistryEntry,
  shadowed: LocaleRegistryEntry[],
): LocaleRegistrySelection["selectionReason"] {
  if (shadowed.length === 0) {
    return "only-provider";
  }
  if (selected.compatibility.ok && shadowed.some((entry) => !entry.compatibility.ok)) {
    return "compatibility";
  }
  if (
    shadowed.some(
      (entry) => LOCALE_ORIGIN_RANK[entry.origin] !== LOCALE_ORIGIN_RANK[selected.origin],
    )
  ) {
    return "origin";
  }
  const selectedVersion = selected.version ?? null;
  if (
    shadowed.some((entry) => {
      const cmp = compareSemverStrings(selectedVersion, entry.version ?? null);
      return cmp != null && cmp !== 0;
    })
  ) {
    return "version";
  }
  return "id";
}

function buildSelections(entries: LocaleRegistryEntry[]): {
  selections: LocaleRegistrySelection[];
  conflicts: LocaleRegistryConflict[];
  diagnostics: PluginDiagnostic[];
} {
  const groups = new Map<string, LocaleRegistryEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.key);
    if (group) {
      group.push(entry);
      continue;
    }
    groups.set(entry.key, [entry]);
  }

  const selections: LocaleRegistrySelection[] = [];
  const conflicts: LocaleRegistryConflict[] = [];
  const diagnostics: PluginDiagnostic[] = [];

  for (const [key, group] of groups) {
    const compatibleGroup = group.filter((entry) => entry.compatibility.ok);
    const selectionPool = compatibleGroup.length > 0 ? compatibleGroup : group;
    const ordered = [...selectionPool].toSorted(compareLocaleEntries);
    const selected = ordered[0];
    if (!selected) {
      continue;
    }
    const shadowed = group.filter((entry) => entry !== selected).toSorted(compareLocaleEntries);
    const selectionReason = determineSelectionReason(selected, shadowed);
    selections.push({
      key,
      locale: selected.locale,
      kind: selected.kind,
      selected,
      shadowed,
      selectionReason,
    });
    if (shadowed.length > 0) {
      conflicts.push({
        key,
        locale: selected.locale,
        kind: selected.kind,
        selectedPluginId: selected.pluginId,
        shadowedPluginIds: shadowed.map((entry) => entry.pluginId),
        selectionReason,
      });
      diagnostics.push({
        level: "warn",
        pluginId: selected.pluginId,
        source: selected.manifestPath,
        message: `locale conflict for ${selected.locale}/${selected.kind}; selected ${selected.pluginId} over ${shadowed.map((entry) => entry.pluginId).join(", ")}`,
      });
    }
    if (!selected.compatibility.ok && selected.compatibility.reason) {
      diagnostics.push({
        level: "warn",
        pluginId: selected.pluginId,
        source: selected.manifestPath,
        message: `selected locale resource ${selected.locale}/${selected.kind} is compatibility-limited: ${selected.compatibility.reason}`,
      });
    }
  }

  return { selections, conflicts, diagnostics };
}

export function getSelectedLocaleResource(
  registry: LocaleRegistry,
  locale: string,
  kind: LocaleResourceKind,
): LocaleRegistrySelection | null {
  return (
    registry.selections.find(
      (selection) => selection.locale === locale && selection.kind === kind,
    ) ?? null
  );
}

export function listSelectedLocaleResources(
  registry: LocaleRegistry,
  kind: LocaleResourceKind,
): LocaleRegistrySelection[] {
  return registry.selections.filter((selection) => selection.kind === kind);
}

export function loadLocaleRegistry(options: LoadLocaleRegistryOptions = {}): LocaleRegistry {
  const manifestRegistry = loadPluginManifestRegistry({
    config: options.config,
    workspaceDir: options.workspaceDir,
    cache: false,
    env: options.env,
    candidates: options.candidates,
  });
  const env = options.env ?? process.env;
  const packages = manifestRegistry.plugins
    .map((record) => buildLocalePackage(record))
    .filter((record): record is LocaleRegistryPackage => record !== null)
    .toSorted((left, right) => {
      if (left.locale !== right.locale) {
        return left.locale.localeCompare(right.locale);
      }
      return left.pluginId.localeCompare(right.pluginId);
    });
  const entries = manifestRegistry.plugins.flatMap((record) => buildLocaleEntries(record, env));
  const selectionState = buildSelections(entries);
  return {
    packages,
    entries,
    selections: selectionState.selections.toSorted((left, right) => {
      if (left.locale !== right.locale) {
        return left.locale.localeCompare(right.locale);
      }
      return left.kind.localeCompare(right.kind);
    }),
    conflicts: selectionState.conflicts.toSorted((left, right) =>
      left.key.localeCompare(right.key),
    ),
    diagnostics: [...manifestRegistry.diagnostics, ...selectionState.diagnostics],
  };
}
