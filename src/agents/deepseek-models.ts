import type { ModelDefinitionConfig } from "../config/types.models.js";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

const DEEPSEEK_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const DEEPSEEK_MODEL_CATALOG: ModelDefinitionConfig[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    reasoning: false,
    input: ["text"],
    contextWindow: 131072,
    maxTokens: 8192,
    cost: DEEPSEEK_DEFAULT_COST,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    reasoning: true,
    input: ["text"],
    contextWindow: 131072,
    maxTokens: 8192,
    cost: DEEPSEEK_DEFAULT_COST,
  },
];

export function buildDeepSeekModelDefinition(
  model: (typeof DEEPSEEK_MODEL_CATALOG)[number],
): ModelDefinitionConfig {
  return {
    id: model.id,
    name: model.name,
    api: "openai-completions",
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}
