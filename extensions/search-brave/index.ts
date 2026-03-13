import { createBundledBuiltinSearchProvider, type OpenClawPluginApi } from "openclaw/plugin-sdk";

const plugin = {
  id: "search-brave",
  name: "Brave Search",
  description: "Bundled Brave web search provider for OpenClaw.",
  register(api: OpenClawPluginApi) {
    api.registerSearchProvider(createBundledBuiltinSearchProvider("brave"));
  },
};

export default plugin;
