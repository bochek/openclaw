import { createBundledBuiltinSearchProvider, type OpenClawPluginApi } from "openclaw/plugin-sdk";

const plugin = {
  id: "search-gemini",
  name: "Gemini Search",
  description: "Bundled Gemini web search provider for OpenClaw.",
  register(api: OpenClawPluginApi) {
    api.registerSearchProvider(createBundledBuiltinSearchProvider("gemini"));
  },
};

export default plugin;
