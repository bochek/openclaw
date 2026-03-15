import type { MsgContext } from "../auto-reply/templating.js";
import type { OpenClawConfig } from "../config/config.js";
import type {
  MediaUnderstandingConfig,
  MediaUnderstandingModelConfig,
} from "../config/types.tools.js";
import { normalizeExtensionHostMediaProviderId } from "../extension-host/media-runtime-registry.js";
import type { MediaAttachmentCache } from "./attachments.js";
import type {
  MediaUnderstandingCapability,
  MediaUnderstandingDecision,
  MediaUnderstandingModelDecision,
  MediaUnderstandingOutput,
} from "./types.js";

export type ProviderRegistry = Map<string, import("./types.js").MediaUnderstandingProvider>;

export function buildModelDecision(params: {
  entry: MediaUnderstandingModelConfig;
  entryType: "provider" | "cli";
  outcome: MediaUnderstandingModelDecision["outcome"];
  reason?: string;
}): MediaUnderstandingModelDecision {
  if (params.entryType === "cli") {
    const command = params.entry.command?.trim();
    return {
      type: "cli",
      provider: command ?? "cli",
      model: params.entry.model ?? command,
      outcome: params.outcome,
      reason: params.reason,
    };
  }
  const providerIdRaw = params.entry.provider?.trim();
  const providerId = providerIdRaw
    ? normalizeExtensionHostMediaProviderId(providerIdRaw)
    : undefined;
  return {
    type: "provider",
    provider: providerId ?? providerIdRaw,
    model: params.entry.model,
    outcome: params.outcome,
    reason: params.reason,
  };
}

export function formatDecisionSummary(decision: MediaUnderstandingDecision): string {
  const attachments = Array.isArray(decision.attachments) ? decision.attachments : [];
  const total = attachments.length;
  const success = attachments.filter((entry) => entry?.chosen?.outcome === "success").length;
  const chosen = attachments.find((entry) => entry?.chosen)?.chosen;
  const provider = typeof chosen?.provider === "string" ? chosen.provider.trim() : undefined;
  const model = typeof chosen?.model === "string" ? chosen.model.trim() : undefined;
  const modelLabel = provider ? (model ? `${provider}/${model}` : provider) : undefined;
  const reason = attachments
    .flatMap((entry) => {
      const attempts = Array.isArray(entry?.attempts) ? entry.attempts : [];
      return attempts
        .map((attempt) => (typeof attempt?.reason === "string" ? attempt.reason : undefined))
        .filter((value): value is string => Boolean(value));
    })
    .find((value) => value.trim().length > 0);
  const shortReason = reason ? reason.split(":")[0]?.trim() : undefined;
  const countLabel = total > 0 ? ` (${success}/${total})` : "";
  const viaLabel = modelLabel ? ` via ${modelLabel}` : "";
  const reasonLabel = shortReason ? ` reason=${shortReason}` : "";
  return `${decision.capability}: ${decision.outcome}${countLabel}${viaLabel}${reasonLabel}`;
}

export async function runProviderEntry(params: {
  capability: MediaUnderstandingCapability;
  entry: MediaUnderstandingModelConfig;
  cfg: OpenClawConfig;
  ctx: MsgContext;
  attachmentIndex: number;
  cache: MediaAttachmentCache;
  agentDir?: string;
  providerRegistry: ProviderRegistry;
  config?: MediaUnderstandingConfig;
}): Promise<MediaUnderstandingOutput | null> {
  const runtime = await import("../extension-host/media-runtime-execution.js");
  return runtime.runProviderEntry(params);
}

export async function runCliEntry(params: {
  capability: MediaUnderstandingCapability;
  entry: MediaUnderstandingModelConfig;
  cfg: OpenClawConfig;
  ctx: MsgContext;
  attachmentIndex: number;
  cache: MediaAttachmentCache;
  config?: MediaUnderstandingConfig;
}): Promise<MediaUnderstandingOutput | null> {
  const runtime = await import("../extension-host/media-runtime-execution.js");
  return runtime.runCliEntry(params);
}
