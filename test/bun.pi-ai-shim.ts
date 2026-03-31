import { vi } from "vitest";

export * from "../node_modules/@mariozechner/pi-ai/dist/index.js";
export { complete, completeSimple, stream, streamSimple } from "../node_modules/@mariozechner/pi-ai/dist/stream.js";

export const getOAuthApiKey = () => undefined;
export const getOAuthProviders = () => [];
export const loginOpenAICodex = vi.fn();
