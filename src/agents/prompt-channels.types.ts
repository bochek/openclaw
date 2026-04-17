import type { MemoryCitationsMode } from "../config/types.memory.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import type { PromptMode } from "./system-prompt.types.js";

export type PromptChannelTarget = "system" | "developer" | "user";

export type PromptChannelRoutingResult = {
  systemAdditions?: string;
  developerAdditions?: string;
  userAdditions?: string;
  memorySectionTarget?: "system" | "user";
  contextFileRoutes?: Record<string, PromptChannelTarget>;
};

export type PromptChannelRoutingEvent = {
  prompt: string;
  promptMode: PromptMode;
  contextFiles: EmbeddedContextFile[];
  toolNames: string[];
  includeMemorySection: boolean;
  memoryCitationsMode?: MemoryCitationsMode;
};
