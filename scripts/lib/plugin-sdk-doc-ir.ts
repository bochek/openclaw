import type {
  PluginSdkDocCategory,
  PluginSdkDocEntrypoint,
  PluginSdkDocStability,
} from "./plugin-sdk-doc-metadata.ts";

export type PluginSdkDocExportKind =
  | "class"
  | "const"
  | "enum"
  | "function"
  | "interface"
  | "namespace"
  | "type"
  | "unknown"
  | "variable";

export type PluginSdkDocSourceLink = {
  line: number;
  path: string;
  url: string;
};

export type PluginSdkDocTag = {
  name: string;
  text: string;
};

export type PluginSdkDocExport = {
  declaration: string | null;
  deprecated: string | null;
  exportName: string;
  kind: PluginSdkDocExportKind;
  remarks: string | null;
  source: PluginSdkDocSourceLink | null;
  summary: string | null;
  tags: PluginSdkDocTag[];
};

export type PluginSdkDocModule = {
  category: PluginSdkDocCategory;
  entrypoint: PluginSdkDocEntrypoint;
  exports: PluginSdkDocExport[];
  importSpecifier: string;
  outputPath: string;
  route: string;
  slug: string;
  source: PluginSdkDocSourceLink;
  stability: PluginSdkDocStability;
  summary: string;
};

export type PluginSdkDocCategoryIndex = {
  category: PluginSdkDocCategory;
  modules: PluginSdkDocModule[];
  outputPath: string;
  route: string;
};

export type PluginSdkDocSiteModel = {
  categories: PluginSdkDocCategoryIndex[];
  modules: PluginSdkDocModule[];
};

export const pluginSdkDocCategoryLabels: Record<PluginSdkDocCategory, string> = {
  channel: "Channel",
  core: "Core",
  legacy: "Legacy",
  provider: "Provider",
  runtime: "Runtime",
  utilities: "Utilities",
};

export function resolvePluginSdkDocModuleSlug(entrypoint: PluginSdkDocEntrypoint): string {
  return entrypoint === "index" ? "root-barrel" : entrypoint;
}

export function resolvePluginSdkDocModuleRoute(entrypoint: PluginSdkDocEntrypoint): string {
  return `/reference/plugin-sdk/modules/${resolvePluginSdkDocModuleSlug(entrypoint)}`;
}
