import type { OpenClawConfig } from "../config/config.js";
import {
  startExtensionHostServices,
  type ExtensionHostServicesHandle,
} from "../extension-host/contributions/service-lifecycle.js";
import type { PluginRegistry } from "./registry.js";

export type PluginServicesHandle = ExtensionHostServicesHandle;

export async function startPluginServices(params: {
  registry: PluginRegistry;
  config: OpenClawConfig;
  workspaceDir?: string;
}): Promise<PluginServicesHandle> {
  return startExtensionHostServices(params);
}
