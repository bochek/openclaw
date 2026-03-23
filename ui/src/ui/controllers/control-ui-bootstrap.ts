import {
  CONTROL_UI_BOOTSTRAP_CONFIG_PATH,
  type ControlUiBootstrapConfig,
  type ControlUiLocaleBootstrapEntry,
} from "../../../../src/gateway/control-ui-contract.js";
import { i18n, registerRemoteLocaleTranslationSource } from "../../i18n/index.ts";
import { normalizeAssistantIdentity } from "../assistant-identity.ts";
import { normalizeBasePath } from "../navigation.ts";

export type ControlUiBootstrapState = {
  basePath: string;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  serverVersion: string | null;
  settings?: {
    locale?: string;
  };
};

function normalizeBootstrapLocales(value: unknown): ControlUiLocaleBootstrapEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const locales: ControlUiLocaleBootstrapEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const locale = typeof entry.locale === "string" ? entry.locale.trim() : "";
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!locale || !url) {
      continue;
    }
    locales.push({ locale, url });
  }
  return locales;
}

export async function loadControlUiBootstrapConfig(state: ControlUiBootstrapState) {
  if (typeof window === "undefined") {
    return;
  }
  if (typeof fetch !== "function") {
    return;
  }

  const basePath = normalizeBasePath(state.basePath ?? "");
  const url = basePath
    ? `${basePath}${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`
    : CONTROL_UI_BOOTSTRAP_CONFIG_PATH;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) {
      return;
    }
    const parsed = (await res.json()) as ControlUiBootstrapConfig;
    const normalized = normalizeAssistantIdentity({
      agentId: parsed.assistantAgentId ?? null,
      name: parsed.assistantName,
      avatar: parsed.assistantAvatar ?? null,
    });
    for (const locale of normalizeBootstrapLocales(parsed.locales)) {
      registerRemoteLocaleTranslationSource(locale);
    }
    state.assistantName = normalized.name;
    state.assistantAvatar = normalized.avatar;
    state.assistantAgentId = normalized.agentId ?? null;
    state.serverVersion = parsed.serverVersion ?? null;

    const preferredLocale =
      typeof state.settings?.locale === "string" ? state.settings.locale.trim() : "";
    if (preferredLocale) {
      await i18n.setLocale(preferredLocale);
    }
  } catch {
    // Ignore bootstrap failures; UI will update identity after connecting.
  }
}
