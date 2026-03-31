import { buildAnthropicCliBackend } from "../../extensions/anthropic/test-api.js";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";

export function configureAnthropicCliRunnerTestRegistry() {
  const registry = createEmptyPluginRegistry();
  registry.cliBackends = [
    {
      pluginId: "anthropic",
      backend: buildAnthropicCliBackend(),
      source: "test",
    },
  ];
  setActivePluginRegistry(registry);
}
