import type { OpenClawConfig } from "../config/config.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export async function applyDefaultModelChoice(params: {
  config: OpenClawConfig;
  setDefaultModel: boolean;
  defaultModel: string;
  applyDefaultConfig: (config: OpenClawConfig) => OpenClawConfig;
  applyProviderConfig: (config: OpenClawConfig) => OpenClawConfig;
  noteDefault?: string;
  noteAgentModel: (model: string) => Promise<void>;
  prompter: WizardPrompter;
}): Promise<{ config: OpenClawConfig; agentModelOverride?: string }> {
  if (params.setDefaultModel) {
    const next = params.applyDefaultConfig(params.config);
    if (params.noteDefault) {
      await params.prompter.note(`Default model set to ${params.noteDefault}`, "Model configured");
    }
    return { config: next };
  }

  const next = params.applyProviderConfig(params.config);
  const models = { ...next.agents?.defaults?.models };
  models[params.defaultModel] = {
    ...models[params.defaultModel],
  };
  const nextWithModel = {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        models,
      },
    },
  };
  await params.noteAgentModel(params.defaultModel);
  return { config: nextWithModel, agentModelOverride: params.defaultModel };
}
