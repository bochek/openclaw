import { createBundledBuiltinSearchProvider, type OpenClawPluginApi } from "openclaw/plugin-sdk";

const plugin = {
  id: "search-kimi",
  name: "Kimi Search",
  description: "Bundled Kimi web search provider for OpenClaw.",
  register(api: OpenClawPluginApi) {
    api.registerSearchProvider(createBundledBuiltinSearchProvider("kimi"));
  },
};

export default plugin;
