export type PluginSdkDocCategory =
  | "channel"
  | "core"
  | "legacy"
  | "provider"
  | "runtime"
  | "utilities";

export type PluginSdkDocStability = "advanced" | "hidden" | "legacy" | "stable";

export type PluginSdkDocMetadata = {
  category: PluginSdkDocCategory;
  stability: PluginSdkDocStability;
  summary: string;
};

export const pluginSdkDocMetadata = {
  index: {
    category: "legacy",
    stability: "legacy",
    summary: "Root barrel kept for compatibility; new docs should point to focused subpaths.",
  },
  compat: {
    category: "legacy",
    stability: "legacy",
    summary: "Deprecated compatibility surface for older plugins migrating off broad imports.",
  },
  "channel-runtime": {
    category: "legacy",
    stability: "legacy",
    summary: "Legacy runtime helper shim for older channel helpers.",
  },
  core: {
    category: "core",
    stability: "stable",
    summary: "Primary entry surface for plugin definitions and base plugin-facing types.",
  },
  "plugin-entry": {
    category: "core",
    stability: "stable",
    summary: "Small entry helper for provider and command plugins.",
  },
  "channel-actions": {
    category: "channel",
    stability: "stable",
    summary: "Shared action and reaction helpers for channel plugins.",
  },
  "channel-config-schema": {
    category: "channel",
    stability: "stable",
    summary: "Channel config schema builders and shared schema primitives.",
  },
  "channel-contract": {
    category: "channel",
    stability: "stable",
    summary: "Core channel contract types for channel plugins.",
  },
  "channel-pairing": {
    category: "channel",
    stability: "stable",
    summary: "Pairing controllers and DM approval flows.",
  },
  "channel-reply-pipeline": {
    category: "channel",
    stability: "stable",
    summary: "Common reply and typing orchestration for channel plugins.",
  },
  "channel-setup": {
    category: "channel",
    stability: "stable",
    summary: "Setup adapter surfaces for channel onboarding.",
  },
  "command-auth": {
    category: "channel",
    stability: "stable",
    summary: "Shared command authorization helpers.",
  },
  "secret-input": {
    category: "channel",
    stability: "stable",
    summary: "Secret input parsing and normalization helpers.",
  },
  "webhook-ingress": {
    category: "channel",
    stability: "stable",
    summary: "Webhook request validation, target registration, and routing helpers.",
  },
  "provider-onboard": {
    category: "provider",
    stability: "stable",
    summary: "Provider onboarding config patch helpers.",
  },
  "runtime-store": {
    category: "runtime",
    stability: "stable",
    summary: "Persistent runtime storage helpers for plugins.",
  },
  "allow-from": {
    category: "utilities",
    stability: "stable",
    summary: "Allowlist formatting and normalization helpers.",
  },
  "reply-payload": {
    category: "utilities",
    stability: "stable",
    summary: "Reply payload normalization and outbound media helpers.",
  },
  testing: {
    category: "utilities",
    stability: "stable",
    summary: "Plugin test helpers, mocks, and runtime fixtures.",
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
