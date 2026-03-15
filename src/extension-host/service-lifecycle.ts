import type { OpenClawConfig } from "../config/config.js";
import { STATE_DIR } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { OpenClawPluginServiceContext, PluginLogger } from "../plugins/types.js";
import { listExtensionHostServiceRegistrations } from "./runtime-registry.js";

const log = createSubsystemLogger("plugins");

function createExtensionHostServiceLogger(): PluginLogger {
  return {
    info: (msg) => log.info(msg),
    warn: (msg) => log.warn(msg),
    error: (msg) => log.error(msg),
    debug: (msg) => log.debug(msg),
  };
}

function createExtensionHostServiceContext(params: {
  config: OpenClawConfig;
  workspaceDir?: string;
}): OpenClawPluginServiceContext {
  return {
    config: params.config,
    workspaceDir: params.workspaceDir,
    stateDir: STATE_DIR,
    logger: createExtensionHostServiceLogger(),
  };
}

export type ExtensionHostServicesHandle = {
  stop: () => Promise<void>;
};

export async function startExtensionHostServices(params: {
  registry: PluginRegistry;
  config: OpenClawConfig;
  workspaceDir?: string;
}): Promise<ExtensionHostServicesHandle> {
  const running: Array<{
    id: string;
    stop?: () => void | Promise<void>;
  }> = [];
  const serviceContext = createExtensionHostServiceContext({
    config: params.config,
    workspaceDir: params.workspaceDir,
  });

  for (const entry of listExtensionHostServiceRegistrations(params.registry)) {
    const service = entry.service;
    try {
      await service.start(serviceContext);
      running.push({
        id: service.id,
        stop: service.stop ? () => service.stop?.(serviceContext) : undefined,
      });
    } catch (err) {
      log.error(`plugin service failed (${service.id}): ${String(err)}`);
    }
  }

  return {
    stop: async () => {
      for (const entry of running.toReversed()) {
        if (!entry.stop) {
          continue;
        }
        try {
          await entry.stop();
        } catch (err) {
          log.warn(`plugin service stop failed (${entry.id}): ${String(err)}`);
        }
      }
    },
  };
}
