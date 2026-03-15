import type { OpenClawConfig } from "../config/config.js";
import {
  applyExtensionHostDefaultModel,
  mergeExtensionHostConfigPatch,
  pickExtensionHostAuthMethod,
  resolveExtensionHostProviderMatch,
} from "../extension-host/provider-auth.js";
import type { ProviderAuthMethod, ProviderPlugin } from "../plugins/types.js";

export function resolveProviderMatch(
  providers: ProviderPlugin[],
  rawProvider?: string,
): ProviderPlugin | null {
  return resolveExtensionHostProviderMatch(providers, rawProvider);
}

export function pickAuthMethod(
  provider: ProviderPlugin,
  rawMethod?: string,
): ProviderAuthMethod | null {
  return pickExtensionHostAuthMethod(provider, rawMethod);
}

export function mergeConfigPatch<T>(base: T, patch: unknown): T {
  return mergeExtensionHostConfigPatch(base, patch);
}

export function applyDefaultModel(cfg: OpenClawConfig, model: string): OpenClawConfig {
  return applyExtensionHostDefaultModel(cfg, model);
}
