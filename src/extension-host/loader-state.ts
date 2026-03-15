import type { PluginRecord, PluginRegistry } from "../plugins/registry.js";

export function setExtensionHostPluginRecordDisabled(
  record: PluginRecord,
  reason?: string,
): PluginRecord {
  record.enabled = false;
  record.status = "disabled";
  record.error = reason;
  return record;
}

export function setExtensionHostPluginRecordError(
  record: PluginRecord,
  message: string,
): PluginRecord {
  record.status = "error";
  record.error = message;
  return record;
}

export function appendExtensionHostPluginRecord(params: {
  registry: PluginRegistry;
  record: PluginRecord;
  seenIds?: Map<string, PluginRecord["origin"]>;
  pluginId?: string;
  origin?: PluginRecord["origin"];
}): void {
  params.registry.plugins.push(params.record);
  if (params.seenIds && params.pluginId && params.origin) {
    params.seenIds.set(params.pluginId, params.origin);
  }
}
