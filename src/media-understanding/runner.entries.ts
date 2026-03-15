import type { MsgContext } from "../auto-reply/templating.js";
import type { OpenClawConfig } from "../config/config.js";
import type {
  MediaUnderstandingConfig,
  MediaUnderstandingModelConfig,
} from "../config/types.tools.js";
export {
  buildModelDecision,
  formatDecisionSummary,
} from "../extension-host/media-runtime-decision.js";
import type { MediaAttachmentCache } from "./attachments.js";
import type { MediaUnderstandingCapability, MediaUnderstandingOutput } from "./types.js";

export type ProviderRegistry = Map<string, import("./types.js").MediaUnderstandingProvider>;

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
