import type { AnyAgentTool } from "../agents/tools/common.js";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import { registerContextEngine } from "../context-engine/registry.js";
import {
  applyExtensionHostTypedHookPolicy,
  bridgeExtensionHostLegacyHooks,
} from "../extension-host/hook-compat.js";
import { createExtensionHostPluginApi } from "../extension-host/plugin-api.js";
import {
  addExtensionChannelRegistration,
  addExtensionCliRegistration,
  addExtensionCommandRegistration,
  addExtensionContextEngineRegistration,
  addExtensionGatewayMethodRegistration,
  addExtensionLegacyHookRegistration,
  addExtensionHttpRouteRegistration,
  addExtensionProviderRegistration,
  addExtensionServiceRegistration,
  addExtensionToolRegistration,
  addExtensionTypedHookRegistration,
} from "../extension-host/registry-writes.js";
import {
  resolveExtensionChannelRegistration,
  resolveExtensionCliRegistration,
  resolveExtensionContextEngineRegistration,
  resolveExtensionGatewayMethodRegistration,
  resolveExtensionLegacyHookRegistration,
  resolveExtensionHttpRouteRegistration,
  resolveExtensionServiceRegistration,
  resolveExtensionToolRegistration,
  resolveExtensionTypedHookRegistration,
} from "../extension-host/runtime-registrations.js";
import type { GatewayRequestHandler } from "../gateway/server-methods/types.js";
import { registerInternalHook } from "../hooks/internal-hooks.js";
import type { PluginRecord, PluginRegistry, PluginRegistryParams } from "../plugins/registry.js";
import type {
  PluginDiagnostic,
  PluginHookHandlerMap,
  PluginHookName,
  OpenClawPluginApi,
  OpenClawPluginChannelRegistration,
  OpenClawPluginCliRegistrar,
  OpenClawPluginCommandDefinition,
  OpenClawPluginHookOptions,
  OpenClawPluginHttpRouteParams,
  OpenClawPluginService,
  OpenClawPluginToolFactory,
  ProviderPlugin,
  PluginHookRegistration as TypedPluginHookRegistration,
} from "../plugins/types.js";
import {
  pushExtensionHostRegistryDiagnostic,
  resolveExtensionHostCommandCompatibility,
  resolveExtensionHostProviderCompatibility,
} from "./plugin-registry-compat.js";

type PluginTypedHookPolicy = {
  allowPromptInjection?: boolean;
};

export function createExtensionHostPluginRegistry(params: {
  registry: PluginRegistry;
  registryParams: PluginRegistryParams;
}) {
  const { registry, registryParams } = params;
  const coreGatewayMethods = new Set(Object.keys(registryParams.coreGatewayHandlers ?? {}));
  const pushDiagnostic = (diag: PluginDiagnostic) => {
    registry.diagnostics.push(diag);
  };

  const registerTool = (
    record: PluginRecord,
    tool: AnyAgentTool | OpenClawPluginToolFactory,
    opts?: { name?: string; names?: string[]; optional?: boolean },
  ) => {
    const result = resolveExtensionToolRegistration({
      ownerPluginId: record.id,
      ownerSource: record.source,
      tool,
      opts,
    });
    addExtensionToolRegistration({ registry, record, names: result.names, entry: result.entry });
  };

  const registerHook = (
    record: PluginRecord,
    events: string | string[],
    handler: Parameters<typeof registerInternalHook>[1],
    opts: OpenClawPluginHookOptions | undefined,
    config: OpenClawPluginApi["config"],
  ) => {
    const normalized = resolveExtensionLegacyHookRegistration({
      ownerPluginId: record.id,
      ownerSource: record.source,
      events,
      handler,
      opts,
    });
    if (!normalized.ok) {
      pushExtensionHostRegistryDiagnostic({
        registry,
        level: "warn",
        pluginId: record.id,
        source: record.source,
        message: normalized.message,
      });
      return;
    }
    addExtensionLegacyHookRegistration({
      registry,
      record,
      hookName: normalized.hookName,
      entry: normalized.entry,
      events: normalized.events,
    });

    bridgeExtensionHostLegacyHooks({
      events: normalized.events,
      handler,
      hookSystemEnabled: config?.hooks?.internal?.enabled === true,
      register: opts?.register,
      registerHook: registerInternalHook,
    });
  };

  const registerGatewayMethod = (
    record: PluginRecord,
    method: string,
    handler: GatewayRequestHandler,
  ) => {
    const result = resolveExtensionGatewayMethodRegistration({
      existing: registry.gatewayHandlers,
      coreGatewayMethods,
      method,
      handler,
    });
    if (!result.ok) {
      pushExtensionHostRegistryDiagnostic({
        registry,
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: result.message,
      });
      return;
    }
    addExtensionGatewayMethodRegistration({
      registry,
      record,
      method: result.method,
      handler: result.handler,
    });
  };

  const registerHttpRoute = (record: PluginRecord, route: OpenClawPluginHttpRouteParams) => {
    const result = resolveExtensionHttpRouteRegistration({
      existing: registry.httpRoutes,
      ownerPluginId: record.id,
      ownerSource: record.source,
      route,
    });
    if (!result.ok) {
      pushExtensionHostRegistryDiagnostic({
        registry,
        level: result.message === "http route registration missing path" ? "warn" : "error",
        pluginId: record.id,
        source: record.source,
        message: result.message,
      });
      return;
    }
    if (result.action === "replace") {
      addExtensionHttpRouteRegistration({
        registry,
        record,
        action: "replace",
        existingIndex: result.existingIndex,
        entry: result.entry,
      });
      return;
    }
    addExtensionHttpRouteRegistration({
      registry,
      record,
      action: "append",
      entry: result.entry,
    });
  };

  const registerChannel = (
    record: PluginRecord,
    registration: OpenClawPluginChannelRegistration | ChannelPlugin,
  ) => {
    const result = resolveExtensionChannelRegistration({
      existing: registry.channels,
      ownerPluginId: record.id,
      ownerSource: record.source,
      registration,
    });
    if (!result.ok) {
      pushExtensionHostRegistryDiagnostic({
        registry,
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: result.message,
      });
      return;
    }
    addExtensionChannelRegistration({
      registry,
      record,
      channelId: result.channelId,
      entry: result.entry,
    });
  };

  const registerProvider = (record: PluginRecord, provider: ProviderPlugin) => {
    const result = resolveExtensionHostProviderCompatibility({
      registry,
      record,
      provider,
    });
    if (!result.ok) {
      return;
    }
    addExtensionProviderRegistration({
      registry,
      record,
      providerId: result.providerId,
      entry: result.entry,
    });
  };

  const registerCli = (
    record: PluginRecord,
    registrar: OpenClawPluginCliRegistrar,
    opts?: { commands?: string[] },
  ) => {
    const result = resolveExtensionCliRegistration({
      ownerPluginId: record.id,
      ownerSource: record.source,
      registrar,
      opts,
    });
    addExtensionCliRegistration({
      registry,
      record,
      commands: result.commands,
      entry: result.entry,
    });
  };

  const registerService = (record: PluginRecord, service: OpenClawPluginService) => {
    const result = resolveExtensionServiceRegistration({
      ownerPluginId: record.id,
      ownerSource: record.source,
      service,
    });
    if (!result.ok) {
      return;
    }
    addExtensionServiceRegistration({
      registry,
      record,
      serviceId: result.serviceId,
      entry: result.entry,
    });
  };

  const registerCommand = (record: PluginRecord, command: OpenClawPluginCommandDefinition) => {
    const normalized = resolveExtensionHostCommandCompatibility({ registry, record, command });
    if (!normalized.ok) {
      return;
    }
    addExtensionCommandRegistration({
      registry,
      record,
      commandName: normalized.commandName,
      entry: normalized.entry,
    });
  };

  const registerTypedHook = <K extends PluginHookName>(
    record: PluginRecord,
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number },
    policy?: PluginTypedHookPolicy,
  ) => {
    const normalized = resolveExtensionTypedHookRegistration({
      ownerPluginId: record.id,
      ownerSource: record.source,
      hookName,
      handler,
      priority: opts?.priority,
    });
    if (!normalized.ok) {
      pushExtensionHostRegistryDiagnostic({
        registry,
        level: "warn",
        pluginId: record.id,
        source: record.source,
        message: normalized.message,
      });
      return;
    }
    const policyResult = applyExtensionHostTypedHookPolicy({
      hookName: normalized.hookName,
      handler,
      policy,
      blockedMessage: `typed hook "${normalized.hookName}" blocked by plugins.entries.${record.id}.hooks.allowPromptInjection=false`,
      constrainedMessage: `typed hook "${normalized.hookName}" prompt fields constrained by plugins.entries.${record.id}.hooks.allowPromptInjection=false`,
    });
    if (!policyResult.ok) {
      pushExtensionHostRegistryDiagnostic({
        registry,
        level: "warn",
        pluginId: record.id,
        source: record.source,
        message: policyResult.message,
      });
      return;
    }
    if (policyResult.warningMessage) {
      pushExtensionHostRegistryDiagnostic({
        registry,
        level: "warn",
        pluginId: record.id,
        source: record.source,
        message: policyResult.warningMessage,
      });
    }
    addExtensionTypedHookRegistration({
      registry,
      record,
      entry: {
        ...normalized.entry,
        pluginId: record.id,
        hookName: normalized.hookName,
        handler: policyResult.entryHandler,
      } as TypedPluginHookRegistration,
    });
  };

  const createApi = (
    record: PluginRecord,
    params: {
      config: OpenClawPluginApi["config"];
      pluginConfig?: Record<string, unknown>;
      hookPolicy?: PluginTypedHookPolicy;
    },
  ): OpenClawPluginApi => {
    return createExtensionHostPluginApi({
      record,
      runtime: registryParams.runtime,
      logger: registryParams.logger,
      config: params.config,
      pluginConfig: params.pluginConfig,
      registerTool: (tool, opts) => registerTool(record, tool, opts),
      registerHook: (events, handler, opts) =>
        registerHook(record, events, handler, opts, params.config),
      registerHttpRoute: (routeParams) => registerHttpRoute(record, routeParams),
      registerChannel: (registration) => registerChannel(record, registration as never),
      registerProvider: (provider) => registerProvider(record, provider),
      registerGatewayMethod: (method, handler) => registerGatewayMethod(record, method, handler),
      registerCli: (registrar, opts) => registerCli(record, registrar, opts),
      registerService: (service) => registerService(record, service),
      registerCommand: (command) => registerCommand(record, command),
      registerContextEngine: (id, factory) => {
        const result = resolveExtensionContextEngineRegistration({
          engineId: id,
          factory,
        });
        if (!result.ok) {
          pushExtensionHostRegistryDiagnostic({
            registry,
            level: "error",
            pluginId: record.id,
            source: record.source,
            message: result.message,
          });
          return;
        }
        addExtensionContextEngineRegistration({
          entry: result.entry,
          registerEngine: registerContextEngine,
        });
      },
      on: (hookName, handler, opts) =>
        registerTypedHook(record, hookName, handler, opts, params.hookPolicy),
    });
  };

  return {
    registry,
    createApi,
    pushDiagnostic,
    registerTool,
    registerChannel,
    registerProvider,
    registerGatewayMethod,
    registerCli,
    registerService,
    registerCommand,
    registerHook,
    registerTypedHook,
  };
}
