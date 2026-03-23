export const CONTROL_UI_BOOTSTRAP_CONFIG_PATH = "/__openclaw/control-ui-config.json";
export const CONTROL_UI_LOCALE_PREFIX = "/__openclaw/locales";

export type ControlUiLocaleBootstrapEntry = {
  locale: string;
  url: string;
};

export type ControlUiBootstrapConfig = {
  basePath: string;
  assistantName: string;
  assistantAvatar: string;
  assistantAgentId: string;
  serverVersion?: string;
  locales?: ControlUiLocaleBootstrapEntry[];
};
