import { formatCliCommand } from "../../../cli/command-format.js";
import type { OpenClawConfig } from "../../../config/config.js";
import { asObjectRecord } from "../shared/object.js";

type SelfHostedProviderWarningParams = {
  providerId: "vllm" | "sglang";
  providerLabel: string;
};

function collectProviderToolWarnings(
  cfg: OpenClawConfig,
  params: SelfHostedProviderWarningParams,
): string[] {
  const provider = asObjectRecord(cfg.models?.providers?.[params.providerId]);
  if (!provider) {
    return [];
  }
  const models = Array.isArray(provider.models) ? provider.models : [];
  const warnings: string[] = [];

  for (const [index, model] of models.entries()) {
    if (!model || typeof model !== "object") {
      continue;
    }
    const compat = asObjectRecord((model as { compat?: unknown }).compat);
    if (compat?.supportsTools === false) {
      continue;
    }
    const modelId =
      typeof (model as { id?: unknown }).id === "string" ? (model as { id: string }).id : `#${index}`;
    const configPath = `models.providers.${params.providerId}.models[${index}].compat.supportsTools`;
    warnings.push(
      [
        `- ${params.providerLabel} model "${modelId}" does not explicitly disable tools.`,
        `- ${params.providerLabel} chat can work while startup or tool turns fail on some self-hosted OpenAI-compatible backends.`,
        `- Recommended: disable tools if you are unsure or having issues using ${formatCliCommand(`openclaw config set ${configPath} false --strict-json`)}.`,
        `- Config path: ${configPath} = false`,
      ].join("\n"),
    );
  }

  return warnings;
}

export function collectSelfHostedOpenAiToolWarnings(cfg: OpenClawConfig): string[] {
  return [
    ...collectProviderToolWarnings(cfg, {
      providerId: "vllm",
      providerLabel: "vLLM",
    }),
    ...collectProviderToolWarnings(cfg, {
      providerId: "sglang",
      providerLabel: "SGLang",
    }),
  ];
}
