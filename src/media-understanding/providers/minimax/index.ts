import type { MediaUnderstandingProvider } from "../../types.js";

const describeImage = async (
  ...args: Parameters<NonNullable<MediaUnderstandingProvider["describeImage"]>>
) => {
  const { describeImageWithModel } = await import("../image.js");
  return describeImageWithModel(...args);
};

export const minimaxProvider: MediaUnderstandingProvider = {
  id: "minimax",
  capabilities: ["image"],
  describeImage,
};

export const minimaxPortalProvider: MediaUnderstandingProvider = {
  id: "minimax-portal",
  capabilities: ["image"],
  describeImage,
};
