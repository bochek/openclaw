import { saveSettings, type UiSettings } from "./storage.ts";

type LastActiveSessionHost = {
  settings: UiSettings;
  applySessionKey: string;
};

export function setLastActiveSessionKey(host: LastActiveSessionHost, next: string) {
  const trimmed = next.trim();
  if (!trimmed) {
    return;
  }
  if (host.settings.lastActiveSessionKey === trimmed) {
    return;
  }
  host.settings = {
    ...host.settings,
    lastActiveSessionKey: trimmed,
  };
  host.applySessionKey = trimmed;
  saveSettings(host.settings);
}
