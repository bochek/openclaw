import {
  applyExtensionHostLoadedPluginProvider,
  applyExtensionHostPluginProvider,
  runExtensionHostProviderAuthMethod,
  type ExtensionHostPluginProviderAuthChoiceOptions,
} from "../extension-host/provider-auth-flow.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";

export type PluginProviderAuthChoiceOptions = ExtensionHostPluginProviderAuthChoiceOptions;

export async function runProviderPluginAuthMethod(params: {
  config: ApplyAuthChoiceParams["config"];
  runtime: ApplyAuthChoiceParams["runtime"];
  prompter: ApplyAuthChoiceParams["prompter"];
  method: Parameters<typeof runExtensionHostProviderAuthMethod>[0]["method"];
  agentDir?: string;
  agentId?: string;
  workspaceDir?: string;
  emitNotes?: boolean;
}): Promise<{ config: ApplyAuthChoiceParams["config"]; defaultModel?: string }> {
  return runExtensionHostProviderAuthMethod(params);
}

export async function applyAuthChoiceLoadedPluginProvider(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  return applyExtensionHostLoadedPluginProvider(params);
}

export async function applyAuthChoicePluginProvider(
  params: ApplyAuthChoiceParams,
  options: PluginProviderAuthChoiceOptions,
): Promise<ApplyAuthChoiceResult | null> {
  return applyExtensionHostPluginProvider(params, options);
}
