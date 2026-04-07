export type PromptProfile = "default" | "small-model-lite";

export function resolvePromptProfileForModel(params: {
  provider?: string;
  modelId?: string;
}): PromptProfile {
  const provider = params.provider?.trim().toLowerCase() ?? "";
  const modelId = params.modelId?.trim().toLowerCase() ?? "";

  // Placeholder seam for smaller/open model tuning. The first real adopters are
  // likely Qwen/Gemma/Llama families through Ollama or OpenAI-compatible routes,
  // but we keep the default path unchanged until the lite-profile prompt content
  // exists and can be evaluated separately from the frontier harness.
  if (!provider && !modelId) {
    return "default";
  }

  return "default";
}
