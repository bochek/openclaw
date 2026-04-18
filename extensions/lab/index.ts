import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "openclaw/plugin-sdk/text-runtime";
import { resolveSessionAgentIds } from "../../src/agents/agent-scope.js";
import { resolveStorePath } from "../../src/config/sessions/paths.js";
import { loadSessionStore } from "../../src/config/sessions/store.js";
import type { OpenClawConfig } from "../../src/config/types.openclaw.js";
import { loadGatewaySessionRow } from "../../src/gateway/session-utils.js";
import {
  loadLabsAgentAgentsOverride,
  loadLabsModelAgentsOverride,
  hasTruncatedLabsAgentsOverrideFiles,
  isLabsModelOverridesEnabled,
  listActiveLabsAgentsOverridePaths,
  resolveCurrentLabsModelId,
  resolveLabsAgentAgentsOverridePath,
  resolveLabsModelAgentsOverridePath,
} from "../../src/lab/model-overrides.js";

const LABS_FEATURES = ["custom"] as const;
type LabsFeatureKey = (typeof LABS_FEATURES)[number];

function isLabsPluginEnabled(cfg: OpenClawConfig): boolean {
  return cfg.plugins?.entries?.lab?.enabled !== false;
}

function updateLabsModelOverridesEnabled(cfg: OpenClawConfig, enabled: boolean): OpenClawConfig {
  const entries = { ...cfg.plugins?.entries };
  const existingEntry = (
    entries.lab && typeof entries.lab === "object" ? entries.lab : {}
  ) as Record<string, unknown>;
  const existingConfig =
    existingEntry.config && typeof existingEntry.config === "object"
      ? (existingEntry.config as Record<string, unknown>)
      : {};
  const existingModelOverrides =
    existingConfig.modelOverrides && typeof existingConfig.modelOverrides === "object"
      ? (existingConfig.modelOverrides as Record<string, unknown>)
      : {};
  entries.lab = {
    ...existingEntry,
    enabled: true,
    config: {
      ...existingConfig,
      modelOverrides: {
        ...existingModelOverrides,
        enabled,
      },
    },
  };

  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      entries,
    },
  };
}

function requiresAdminToMutateLabs(gatewayClientScopes?: readonly string[]): boolean {
  return Array.isArray(gatewayClientScopes) && !gatewayClientScopes.includes("operator.admin");
}

function isKnownLabsFeature(value: string): value is LabsFeatureKey {
  return (LABS_FEATURES as readonly string[]).includes(value);
}

function buildFeatureStateLines(cfg: OpenClawConfig): string[] {
  return [`- custom overrides: ${isLabsModelOverridesEnabled(cfg) ? "enabled" : "disabled"}`];
}

function buildLabsMenuReply(cfg: OpenClawConfig) {
  return {
    text: [
      "Lab",
      "",
      "Experimental feature controls for repo-owned agent experiments.",
      "",
      "Features:",
      ...buildFeatureStateLines(cfg),
      "",
      "Commands:",
      "- /lab custom status",
      "- /lab enable custom",
      "- /lab disable custom",
    ].join("\n"),
    disableMarkdown: true,
  };
}

function buildUnknownFeatureReply(feature: string, cfg: OpenClawConfig) {
  return {
    text: [
      `Unknown Lab feature: ${feature}`,
      "",
      "Available features:",
      ...buildFeatureStateLines(cfg),
      "",
      "Commands:",
      "- /lab custom status",
      "- /lab enable custom",
      "- /lab disable custom",
    ].join("\n"),
    disableMarkdown: true,
  };
}

function buildUnsupportedLabsCommandReply(cfg: OpenClawConfig, rawArgs: string | undefined) {
  const detail = normalizeOptionalString(rawArgs)?.trim();
  return {
    text: [
      detail ? `Unsupported Lab command: ${detail}` : "Unsupported Lab command.",
      "",
      "Commands:",
      "- /lab",
      "- /lab custom status",
      "- /lab enable custom",
      "- /lab disable custom",
      "",
      "Features:",
      ...buildFeatureStateLines(cfg),
    ].join("\n"),
    disableMarkdown: true,
  };
}

function parseLabsCommand(rawArgs: string | undefined): {
  action: "menu" | "status" | "enable" | "disable" | "invalid";
  feature?: string;
} {
  const normalized = normalizeOptionalString(rawArgs)?.trim() ?? "";
  if (!normalized) {
    return { action: "menu" };
  }
  const parts = normalized.split(/\s+/u).filter(Boolean);
  const [verb = "", noun = ""] = parts;
  const action = normalizeLowercaseStringOrEmpty(verb);
  const subject = normalizeLowercaseStringOrEmpty(noun);
  if (action === "custom" && subject === "status" && parts.length === 2) {
    return { action: "status", feature: "custom" };
  }
  if ((action === "enable" || action === "disable") && parts.length === 2) {
    return {
      action,
      feature: subject,
    };
  }
  return { action: "invalid" };
}

export default definePluginEntry({
  id: "lab",
  name: "Lab",
  description: "Bundled incubation space for core-owned experimental agent behavior.",
  register(api) {
    api.registerCommand({
      name: "lab",
      description: "Inspect or manage Lab experimental features for the active session.",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => {
        const parsed = parseLabsCommand(ctx.args);
        if (parsed.action === "menu") {
          return buildLabsMenuReply(ctx.config);
        }
        if (parsed.action === "enable" || parsed.action === "disable") {
          if (!parsed.feature || !isKnownLabsFeature(parsed.feature)) {
            return buildUnknownFeatureReply(parsed.feature || "(missing)", ctx.config);
          }
          if (requiresAdminToMutateLabs(ctx.gatewayClientScopes)) {
            return {
              text: "⚠️ /lab enable|disable custom requires operator.admin for gateway clients.",
              disableMarkdown: true,
            };
          }
          const enabled = parsed.action === "enable";
          const currentConfig = api.runtime.config.loadConfig();
          const nextConfig = updateLabsModelOverridesEnabled(currentConfig, enabled);
          await api.runtime.config.writeConfigFile(nextConfig);
          return {
            text: [
              `Lab custom overrides ${enabled ? "enabled" : "disabled"}.`,
              "",
              `plugin: ${isLabsPluginEnabled(nextConfig) ? "enabled" : "disabled"}`,
              ...buildFeatureStateLines(nextConfig),
            ].join("\n"),
            disableMarkdown: true,
          };
        }
        if (parsed.action !== "status") {
          return buildUnsupportedLabsCommandReply(ctx.config, ctx.args);
        }

        const { sessionAgentId } = resolveSessionAgentIds({
          sessionKey: ctx.sessionKey,
          config: ctx.config,
        });
        const storePath = resolveStorePath(ctx.config.session?.store, {
          agentId: sessionAgentId,
        });
        const sessionStore = loadSessionStore(storePath, { skipCache: true });
        const sessionEntry = ctx.sessionKey ? sessionStore[ctx.sessionKey] : undefined;
        const sessionRow = ctx.sessionKey ? loadGatewaySessionRow(ctx.sessionKey) : null;
        const resolvedSessionEntry = sessionEntry
          ? {
              ...sessionEntry,
              modelProvider: sessionRow?.modelProvider ?? sessionEntry.modelProvider,
              model: sessionRow?.model ?? sessionEntry.model,
            }
          : undefined;
        const modelId = resolveCurrentLabsModelId({
          cfg: ctx.config,
          sessionEntry: resolvedSessionEntry,
          agentId: sessionAgentId,
        });
        const workspaceDir =
          normalizeOptionalString(resolvedSessionEntry?.systemPromptReport?.workspaceDir) ??
          normalizeOptionalString(resolvedSessionEntry?.spawnedWorkspaceDir) ??
          process.cwd();
        const modelOverridePath = resolveLabsModelAgentsOverridePath(workspaceDir, modelId);
        const agentOverridePath = resolveLabsAgentAgentsOverridePath(
          workspaceDir,
          sessionAgentId,
          modelId,
        );
        const [modelOverride, agentOverride] = await Promise.all([
          loadLabsModelAgentsOverride({
            workspaceDir,
            modelId,
            cfg: ctx.config,
          }),
          loadLabsAgentAgentsOverride({
            workspaceDir,
            modelId,
            agentId: sessionAgentId,
            cfg: ctx.config,
          }),
        ]);
        const modelOverrideExists = Boolean(modelOverride);
        const agentOverrideExists = Boolean(agentOverride);
        const activeAddenda = [
          ...(modelOverrideExists ? [modelOverridePath] : []),
          ...(agentOverrideExists ? [agentOverridePath] : []),
        ];
        const truncated = hasTruncatedLabsAgentsOverrideFiles(
          resolvedSessionEntry?.systemPromptReport,
          listActiveLabsAgentsOverridePaths({
            workspaceDir,
            modelId,
            agentId: sessionAgentId,
          }),
        );
        const pluginEnabled = isLabsPluginEnabled(ctx.config);

        const statusLines = [
          "Lab",
          "",
          `plugin: ${pluginEnabled ? "enabled" : "disabled"}`,
          "features:",
          ...buildFeatureStateLines(ctx.config),
          "",
          `model: ${modelId}`,
          `agent: ${sessionAgentId}`,
          `workspace: ${workspaceDir}`,
          `model override: ${modelOverrideExists ? "present" : "absent"}`,
          `agent override: ${agentOverrideExists ? "present" : "absent"}`,
          "checked paths:",
          `- model: ${modelOverridePath}`,
          `- agent: ${agentOverridePath}`,
          "active addenda:",
          ...(activeAddenda.length > 0
            ? activeAddenda.map((pathValue) => `- ${pathValue}`)
            : ["- none"]),
          `truncated: ${truncated ? "yes" : "no"}`,
        ];
        return {
          text: statusLines.join("\n"),
          disableMarkdown: true,
        };
      },
    });
  },
});
