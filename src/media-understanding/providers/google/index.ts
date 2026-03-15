import type { MediaUnderstandingProvider } from "../../types.js";
import { transcribeGeminiAudio } from "./audio.js";
import { describeGeminiVideo } from "./video.js";

const describeImage = async (
  ...args: Parameters<NonNullable<MediaUnderstandingProvider["describeImage"]>>
) => {
  const { describeImageWithModel } = await import("../image.js");
  return describeImageWithModel(...args);
};

export const googleProvider: MediaUnderstandingProvider = {
  id: "google",
  capabilities: ["image", "audio", "video"],
  describeImage,
  transcribeAudio: transcribeGeminiAudio,
  describeVideo: describeGeminiVideo,
};
