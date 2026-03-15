import type { MediaUnderstandingProvider } from "../../types.js";
import { transcribeOpenAiCompatibleAudio } from "./audio.js";

const describeImage = async (
  ...args: Parameters<NonNullable<MediaUnderstandingProvider["describeImage"]>>
) => {
  const { describeImageWithModel } = await import("../image.js");
  return describeImageWithModel(...args);
};

export const openaiProvider: MediaUnderstandingProvider = {
  id: "openai",
  capabilities: ["image", "audio"],
  describeImage,
  transcribeAudio: transcribeOpenAiCompatibleAudio,
};
