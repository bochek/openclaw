import type { GatewayRequestHandlers } from "../gateway/server-methods/types.js";
import type {
  PluginCliRegistration,
  PluginHttpRouteRegistration,
  PluginProviderRegistration,
  PluginRegistry,
  PluginServiceRegistration,
  PluginToolRegistration,
} from "../plugins/registry.js";

const EMPTY_PROVIDERS: readonly PluginProviderRegistration[] = [];
const EMPTY_TOOLS: readonly PluginToolRegistration[] = [];
const EMPTY_SERVICES: readonly PluginServiceRegistration[] = [];
const EMPTY_CLI_REGISTRARS: readonly PluginCliRegistration[] = [];
const EMPTY_HTTP_ROUTES: readonly PluginHttpRouteRegistration[] = [];
const EMPTY_GATEWAY_HANDLERS: Readonly<GatewayRequestHandlers> = Object.freeze({});

export function hasExtensionHostRuntimeEntries(
  registry:
    | Pick<
        PluginRegistry,
        | "plugins"
        | "channels"
        | "tools"
        | "providers"
        | "gatewayHandlers"
        | "httpRoutes"
        | "cliRegistrars"
        | "services"
        | "commands"
        | "hooks"
        | "typedHooks"
      >
    | null
    | undefined,
): boolean {
  if (!registry) {
    return false;
  }
  return (
    registry.plugins.length > 0 ||
    registry.channels.length > 0 ||
    registry.tools.length > 0 ||
    registry.providers.length > 0 ||
    Object.keys(registry.gatewayHandlers).length > 0 ||
    registry.httpRoutes.length > 0 ||
    registry.cliRegistrars.length > 0 ||
    registry.services.length > 0 ||
    registry.commands.length > 0 ||
    registry.hooks.length > 0 ||
    registry.typedHooks.length > 0
  );
}

export function listExtensionHostProviderRegistrations(
  registry: Pick<PluginRegistry, "providers"> | null | undefined,
): readonly PluginProviderRegistration[] {
  return registry?.providers ?? EMPTY_PROVIDERS;
}

export function listExtensionHostToolRegistrations(
  registry: Pick<PluginRegistry, "tools"> | null | undefined,
): readonly PluginToolRegistration[] {
  return registry?.tools ?? EMPTY_TOOLS;
}

export function listExtensionHostServiceRegistrations(
  registry: Pick<PluginRegistry, "services"> | null | undefined,
): readonly PluginServiceRegistration[] {
  return registry?.services ?? EMPTY_SERVICES;
}

export function listExtensionHostCliRegistrations(
  registry: Pick<PluginRegistry, "cliRegistrars"> | null | undefined,
): readonly PluginCliRegistration[] {
  return registry?.cliRegistrars ?? EMPTY_CLI_REGISTRARS;
}

export function listExtensionHostHttpRoutes(
  registry: Pick<PluginRegistry, "httpRoutes"> | null | undefined,
): readonly PluginHttpRouteRegistration[] {
  return registry?.httpRoutes ?? EMPTY_HTTP_ROUTES;
}

export function getExtensionHostGatewayHandlers(
  registry: Pick<PluginRegistry, "gatewayHandlers"> | null | undefined,
): Readonly<GatewayRequestHandlers> {
  return registry?.gatewayHandlers ?? EMPTY_GATEWAY_HANDLERS;
}
