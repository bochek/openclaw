import { createBundledBuiltinSearchProvider, type OpenClawPluginApi } from "openclaw/plugin-sdk";

const plugin = {
  id: "search-perplexity",
  name: "Perplexity Search",
  description: "Bundled Perplexity web search provider for OpenClaw.",
  register(api: OpenClawPluginApi) {
    api.registerSearchProvider(createBundledBuiltinSearchProvider("perplexity"));
  },
};

export default plugin;
