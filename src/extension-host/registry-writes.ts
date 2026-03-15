import type {
  PluginCliRegistration,
  PluginCommandRegistration,
  PluginRecord,
  PluginRegistry,
  PluginServiceRegistration,
  PluginToolRegistration,
} from "../plugins/registry.js";
import type {
  ExtensionHostCliRegistration,
  ExtensionHostCommandRegistration,
  ExtensionHostServiceRegistration,
  ExtensionHostToolRegistration,
} from "./runtime-registrations.js";

export function addExtensionToolRegistration(params: {
  registry: PluginRegistry;
  record: PluginRecord;
  names: string[];
  entry: ExtensionHostToolRegistration;
}): void {
  if (params.names.length > 0) {
    params.record.toolNames.push(...params.names);
  }
  params.registry.tools.push(params.entry as PluginToolRegistration);
}

export function addExtensionCliRegistration(params: {
  registry: PluginRegistry;
  record: PluginRecord;
  commands: string[];
  entry: ExtensionHostCliRegistration;
}): void {
  params.record.cliCommands.push(...params.commands);
  params.registry.cliRegistrars.push(params.entry as PluginCliRegistration);
}

export function addExtensionServiceRegistration(params: {
  registry: PluginRegistry;
  record: PluginRecord;
  serviceId: string;
  entry: ExtensionHostServiceRegistration;
}): void {
  params.record.services.push(params.serviceId);
  params.registry.services.push(params.entry as PluginServiceRegistration);
}

export function addExtensionCommandRegistration(params: {
  registry: PluginRegistry;
  record: PluginRecord;
  commandName: string;
  entry: ExtensionHostCommandRegistration;
}): void {
  params.record.commands.push(params.commandName);
  params.registry.commands.push(params.entry as PluginCommandRegistration);
}
