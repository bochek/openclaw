import { createBundledBuiltinSearchProvider, type OpenClawPluginApi } from "openclaw/plugin-sdk";

const plugin = {
  id: "search-grok",
  name: "Grok Search",
  description: "Bundled xAI Grok web search provider for OpenClaw.",
  register(api: OpenClawPluginApi) {
    api.registerSearchProvider(createBundledBuiltinSearchProvider("grok"));
  },
};

export default plugin;
