export type PluginSdkDocCategory =
  | "channel"
  | "core"
  | "legacy"
  | "provider"
  | "runtime"
  | "utilities";

export type PluginSdkDocStability = "stable" | "unstable";

export type PluginSdkDocMetadata = {
  category: PluginSdkDocCategory;
  stability: PluginSdkDocStability;
};

export const pluginSdkDocMetadata = {
  index: {
    category: "legacy",
    stability: "unstable",
  },
  "channel-runtime": {
    category: "legacy",
    stability: "unstable",
  },
  core: {
    category: "core",
    stability: "unstable",
  },
  "plugin-entry": {
    category: "core",
    stability: "unstable",
  },
  "channel-actions": {
    category: "channel",
    stability: "unstable",
  },
  "channel-config-schema": {
    category: "channel",
    stability: "unstable",
  },
  "channel-contract": {
    category: "channel",
    stability: "unstable",
  },
  "channel-pairing": {
    category: "channel",
    stability: "unstable",
  },
  "channel-reply-pipeline": {
    category: "channel",
    stability: "unstable",
  },
  "channel-setup": {
    category: "channel",
    stability: "unstable",
  },
  "command-auth": {
    category: "channel",
    stability: "unstable",
  },
  "secret-input": {
    category: "channel",
    stability: "unstable",
  },
  "webhook-ingress": {
    category: "channel",
    stability: "unstable",
  },
  "provider-onboard": {
    category: "provider",
    stability: "unstable",
  },
  "runtime-store": {
    category: "runtime",
    stability: "unstable",
  },
  "allow-from": {
    category: "utilities",
    stability: "unstable",
  },
  "reply-payload": {
    category: "utilities",
    stability: "unstable",
  },
  testing: {
    category: "utilities",
    stability: "unstable",
  },
} as const satisfies Record<string, PluginSdkDocMetadata>;

export type PluginSdkDocEntrypoint = keyof typeof pluginSdkDocMetadata;

export const pluginSdkDocCategories = [
  "core",
  "channel",
  "provider",
  "runtime",
  "utilities",
  "legacy",
] as const satisfies readonly PluginSdkDocCategory[];

export const pluginSdkDocEntrypoints = Object.keys(
  pluginSdkDocMetadata,
) as PluginSdkDocEntrypoint[];

export function resolvePluginSdkDocImportSpecifier(entrypoint: PluginSdkDocEntrypoint): string {
  return entrypoint === "index" ? "openclaw/plugin-sdk" : `openclaw/plugin-sdk/${entrypoint}`;
}
