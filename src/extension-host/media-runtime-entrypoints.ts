import type { MsgContext } from "../auto-reply/templating.js";
import type { OpenClawConfig } from "../config/config.js";
import type {
  MediaUnderstandingConfig,
  MediaUnderstandingModelConfig,
} from "../config/types.tools.js";
import type { MediaAttachmentCache } from "../media-understanding/attachments.js";
import type {
  MediaUnderstandingCapability,
  MediaUnderstandingOutput,
  MediaUnderstandingProvider,
} from "../media-understanding/types.js";

export type ExtensionHostMediaProviderRegistry = Map<string, MediaUnderstandingProvider>;

export async function runExtensionHostMediaProviderEntry(params: {
  capability: MediaUnderstandingCapability;
  entry: MediaUnderstandingModelConfig;
  cfg: OpenClawConfig;
  ctx: MsgContext;
  attachmentIndex: number;
  cache: MediaAttachmentCache;
  agentDir?: string;
  providerRegistry: ExtensionHostMediaProviderRegistry;
  config?: MediaUnderstandingConfig;
}): Promise<MediaUnderstandingOutput | null> {
  const runtime = await import("./media-runtime-execution.js");
  return runtime.runProviderEntry(params);
}

export async function runExtensionHostMediaCliEntry(params: {
  capability: MediaUnderstandingCapability;
  entry: MediaUnderstandingModelConfig;
  cfg: OpenClawConfig;
  ctx: MsgContext;
  attachmentIndex: number;
  cache: MediaAttachmentCache;
  config?: MediaUnderstandingConfig;
}): Promise<MediaUnderstandingOutput | null> {
  const runtime = await import("./media-runtime-execution.js");
  return runtime.runCliEntry(params);
}
