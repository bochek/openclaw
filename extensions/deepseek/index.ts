import { emptyPluginConfigSchema, type OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createProviderApiKeyAuthMethod } from "openclaw/plugin-sdk/provider-auth";
import { buildSingleProviderApiKeyCatalog } from "openclaw/plugin-sdk/provider-catalog";
import { applyDeepSeekConfig, DEEPSEEK_DEFAULT_MODEL_REF } from "./onboard.js";
import { buildDeepSeekProvider } from "./provider-catalog.js";

const PROVIDER_ID = "deepseek";

const deepseekPlugin = {
  id: PROVIDER_ID,
  name: "DeepSeek Provider",
  description: "Bundled DeepSeek provider plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: "DeepSeek",
      docsPath: "/providers/deepseek",
      envVars: ["DEEPSEEK_API_KEY"],
      auth: [
        createProviderApiKeyAuthMethod({
          providerId: PROVIDER_ID,
          methodId: "api-key",
          label: "DeepSeek API key",
          hint: "API key",
          optionKey: "deepseekApiKey",
          flagName: "--deepseek-api-key",
          envVar: "DEEPSEEK_API_KEY",
          promptMessage: "Enter DeepSeek API key",
          defaultModel: DEEPSEEK_DEFAULT_MODEL_REF,
          expectedProviders: ["deepseek"],
          applyConfig: (cfg) => applyDeepSeekConfig(cfg),
          wizard: {
            choiceId: "deepseek-api-key",
            choiceLabel: "DeepSeek API key",
            groupId: "deepseek",
            groupLabel: "DeepSeek",
            groupHint: "API key",
          },
        }),
      ],
      catalog: {
        order: "simple",
        run: (ctx) =>
          buildSingleProviderApiKeyCatalog({
            ctx,
            providerId: PROVIDER_ID,
            buildProvider: buildDeepSeekProvider,
          }),
      },
    });
  },
};

export default deepseekPlugin;
