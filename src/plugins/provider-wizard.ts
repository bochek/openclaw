import { DEFAULT_PROVIDER } from "../agents/defaults.js";
import { parseModelRef } from "../agents/model-ref.js";
import { normalizeProviderId } from "../agents/provider-id.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  buildExtensionHostProviderMethodChoice,
  resolveExtensionHostProviderChoice,
  resolveExtensionHostProviderModelPickerEntries,
  resolveExtensionHostProviderWizardOptions,
} from "../extension-host/provider-wizard.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { resolvePluginProviders } from "./providers.js";
import type { ProviderAuthMethod, ProviderPlugin } from "./types.js";

export const PROVIDER_PLUGIN_CHOICE_PREFIX = "provider-plugin:";

export type ProviderWizardOption = {
  value: string;
  label: string;
  hint?: string;
  groupId: string;
  groupLabel: string;
  groupHint?: string;
};

export type ProviderModelPickerEntry = {
  value: string;
  label: string;
  hint?: string;
};

export function buildProviderPluginMethodChoice(providerId: string, methodId: string): string {
  return buildExtensionHostProviderMethodChoice(providerId, methodId);
}

export function resolveProviderWizardOptions(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): ProviderWizardOption[] {
  return resolveExtensionHostProviderWizardOptions(resolvePluginProviders(params));
}

export function resolveProviderModelPickerEntries(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): ProviderModelPickerEntry[] {
  return resolveExtensionHostProviderModelPickerEntries(resolvePluginProviders(params));
}

export function resolveProviderPluginChoice(params: {
  providers: ProviderPlugin[];
  choice: string;
}): { provider: ProviderPlugin; method: ProviderAuthMethod } | null {
  return resolveExtensionHostProviderChoice(params);
}

export async function runProviderModelSelectedHook(params: {
  config: OpenClawConfig;
  model: string;
  prompter: WizardPrompter;
  agentDir?: string;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const parsed = parseModelRef(params.model, DEFAULT_PROVIDER);
  if (!parsed) {
    return;
  }

  const providers = resolvePluginProviders({
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
  });
  const provider = providers.find(
    (entry) => normalizeProviderId(entry.id) === normalizeProviderId(parsed.provider),
  );
  if (!provider?.onModelSelected) {
    return;
  }

  await provider.onModelSelected({
    config: params.config,
    model: params.model,
    prompter: params.prompter,
    agentDir: params.agentDir,
    workspaceDir: params.workspaceDir,
  });
}
