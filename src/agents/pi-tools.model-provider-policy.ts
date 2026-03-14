import type { OpenClawConfig } from "../config/config.js";
import {
  isCodexNativeWebSearchModel,
  resolveCodexNativeSearchActivation,
} from "./codex-native-web-search.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { isXaiProvider } from "./schema/clean-for-xai.js";

const TOOL_DENY_FOR_PROVIDER_NATIVE_WEB_SEARCH = new Set(["web_search"]);

export function applyModelProviderToolPolicy(
  tools: AnyAgentTool[],
  params?: {
    cfg?: OpenClawConfig;
    modelProvider?: string;
    modelApi?: string;
    modelId?: string;
    codexAuthAvailable?: boolean;
  },
): AnyAgentTool[] {
  if (isXaiProvider(params?.modelProvider, params?.modelId)) {
    // xAI/Grok providers expose a native web_search tool; sending OpenClaw's
    // web_search alongside it causes duplicate-name request failures.
    return tools.filter((tool) => !TOOL_DENY_FOR_PROVIDER_NATIVE_WEB_SEARCH.has(tool.name));
  }

  if (!isCodexNativeWebSearchModel(params ?? {})) {
    return tools;
  }

  const activation = resolveCodexNativeSearchActivation({
    cfg: params?.cfg,
    modelProvider: params?.modelProvider,
    modelApi: params?.modelApi,
    modelId: params?.modelId,
    hasCodexAuth: params?.codexAuthAvailable,
  });
  if (activation.state === "openclaw_search") {
    return tools;
  }

  // Codex-native search is opt-in and mutually exclusive with OpenClaw's
  // function-style web_search tool for the same run.
  return tools.filter((tool) => !TOOL_DENY_FOR_PROVIDER_NATIVE_WEB_SEARCH.has(tool.name));
}
