import type { MediaUnderstandingProvider } from "../../types.js";

const describeImage = async (
  ...args: Parameters<NonNullable<MediaUnderstandingProvider["describeImage"]>>
) => {
  const { describeImageWithModel } = await import("../image.js");
  return describeImageWithModel(...args);
};

export const anthropicProvider: MediaUnderstandingProvider = {
  id: "anthropic",
  capabilities: ["image"],
  describeImage,
};
