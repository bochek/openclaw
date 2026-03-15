import { initializeGlobalHookRunner } from "../plugins/hook-runner-global.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { setActiveExtensionHostRegistry } from "./active-registry.js";

export function activateExtensionHostRegistry(registry: PluginRegistry, cacheKey: string): void {
  setActiveExtensionHostRegistry(registry, cacheKey);
  initializeGlobalHookRunner(registry);
}
