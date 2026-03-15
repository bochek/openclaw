import type { MediaUnderstandingProvider } from "../../types.js";
import { describeMoonshotVideo } from "./video.js";

const describeImage = async (
  ...args: Parameters<NonNullable<MediaUnderstandingProvider["describeImage"]>>
) => {
  const { describeImageWithModel } = await import("../image.js");
  return describeImageWithModel(...args);
};

export const moonshotProvider: MediaUnderstandingProvider = {
  id: "moonshot",
  capabilities: ["image", "video"],
  describeImage,
  describeVideo: describeMoonshotVideo,
};
