export {
  buildExtensionHostMediaProviderRegistry as buildProviderRegistry,
  clearExtensionHostMediaBinaryCacheForTests as clearMediaUnderstandingBinaryCacheForTests,
  createExtensionHostMediaAttachmentCache as createMediaAttachmentCache,
  normalizeExtensionHostMediaAttachments as normalizeMediaAttachments,
  resolveExtensionHostAutoImageModel as resolveAutoImageModel,
  resolveExtensionHostMediaAttachmentLocalRoots as resolveMediaAttachmentLocalRoots,
  runExtensionHostMediaApiCapability as runCapability,
  type ActiveMediaModel,
  type ExtensionHostMediaProviderRegistry as ProviderRegistry,
  type RunCapabilityResult,
} from "../extension-host/media-runtime-api.js";
export type {
  MediaAttachment,
  MediaUnderstandingCapability,
  MediaUnderstandingProvider,
} from "./types.js";
