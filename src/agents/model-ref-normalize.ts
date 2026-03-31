import { normalizeProviderId } from "./provider-id.js";

export type NormalizedModelRef = {
  provider: string;
  model: string;
};

function normalizeAnthropicModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return trimmed;
  }
  switch (trimmed.toLowerCase()) {
    case "opus-4.6":
      return "claude-opus-4-6";
    case "opus-4.5":
      return "claude-opus-4-5";
    case "sonnet-4.6":
      return "claude-sonnet-4-6";
    case "sonnet-4.5":
      return "claude-sonnet-4-5";
    default:
      return trimmed;
  }
}

export function normalizeBuiltInProviderModelId(provider: string, model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (provider === "anthropic") {
    return normalizeAnthropicModelId(trimmed);
  }
  if (provider === "vercel-ai-gateway" && !trimmed.includes("/")) {
    const normalizedAnthropicModel = normalizeAnthropicModelId(trimmed);
    if (normalizedAnthropicModel.startsWith("claude-")) {
      return `anthropic/${normalizedAnthropicModel}`;
    }
  }
  if (provider === "openrouter" && !trimmed.includes("/")) {
    return `openrouter/${trimmed}`;
  }
  return trimmed;
}

export function normalizeBuiltInModelRef(provider: string, model: string): NormalizedModelRef {
  const normalizedProvider = normalizeProviderId(provider);
  return {
    provider: normalizedProvider,
    model: normalizeBuiltInProviderModelId(normalizedProvider, model),
  };
}
