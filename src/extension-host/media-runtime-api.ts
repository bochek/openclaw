import type { MsgContext } from "../auto-reply/templating.js";
import type { OpenClawConfig } from "../config/config.js";
import type { MediaUnderstandingConfig } from "../config/types.tools.js";
import {
  MediaAttachmentCache,
  type MediaAttachmentCacheOptions,
  normalizeAttachments,
} from "../media-understanding/attachments.js";
import type {
  MediaAttachment,
  MediaUnderstandingCapability,
  MediaUnderstandingProvider,
} from "../media-understanding/types.js";
import {
  mergeInboundPathRoots,
  resolveIMessageAttachmentRoots,
} from "../media/inbound-path-policy.js";
import { getDefaultMediaLocalRoots } from "../media/local-roots.js";
import {
  clearMediaUnderstandingBinaryCacheForTests as clearExtensionHostMediaUnderstandingBinaryCacheForTests,
  resolveAutoImageModel as resolveExtensionHostMediaRuntimeAutoImageModel,
  type ActiveMediaModel,
} from "./media-runtime-auto.js";
import {
  runCapability as runExtensionHostMediaCapability,
  type RunCapabilityResult,
} from "./media-runtime-orchestration.js";
import {
  buildExtensionHostMediaUnderstandingRegistry,
  type ExtensionHostMediaUnderstandingProviderRegistry,
} from "./media-runtime-registry.js";

type ProviderRegistry = ExtensionHostMediaUnderstandingProviderRegistry;

export type { ActiveMediaModel, RunCapabilityResult };
export type ExtensionHostMediaProviderRegistry = ProviderRegistry;

export function buildExtensionHostMediaProviderRegistry(
  overrides?: Record<string, MediaUnderstandingProvider>,
): ProviderRegistry {
  return buildExtensionHostMediaUnderstandingRegistry(overrides);
}

export function normalizeExtensionHostMediaAttachments(ctx: MsgContext): MediaAttachment[] {
  return normalizeAttachments(ctx);
}

export function resolveExtensionHostMediaAttachmentLocalRoots(params: {
  cfg: OpenClawConfig;
  ctx: MsgContext;
}): readonly string[] {
  return mergeInboundPathRoots(
    getDefaultMediaLocalRoots(),
    resolveIMessageAttachmentRoots({
      cfg: params.cfg,
      accountId: params.ctx.AccountId,
    }),
  );
}

export function createExtensionHostMediaAttachmentCache(
  attachments: MediaAttachment[],
  options?: MediaAttachmentCacheOptions,
): MediaAttachmentCache {
  return new MediaAttachmentCache(attachments, options);
}

export function clearExtensionHostMediaBinaryCacheForTests(): void {
  clearExtensionHostMediaUnderstandingBinaryCacheForTests();
}

export async function resolveExtensionHostAutoImageModel(params: {
  cfg: OpenClawConfig;
  agentDir?: string;
  activeModel?: ActiveMediaModel;
}): Promise<ActiveMediaModel | null> {
  return await resolveExtensionHostMediaRuntimeAutoImageModel({
    ...params,
    providerRegistry: buildExtensionHostMediaProviderRegistry(),
  });
}

export async function runExtensionHostMediaApiCapability(params: {
  capability: MediaUnderstandingCapability;
  cfg: OpenClawConfig;
  ctx: MsgContext;
  attachments: MediaAttachmentCache;
  media: MediaAttachment[];
  agentDir?: string;
  providerRegistry: ProviderRegistry;
  config?: MediaUnderstandingConfig;
  activeModel?: ActiveMediaModel;
}): Promise<RunCapabilityResult> {
  return await runExtensionHostMediaCapability(params);
}
