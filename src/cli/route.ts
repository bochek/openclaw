import { isTruthyEnvValue } from "../infra/env.js";
import { loggingState } from "../logging/state.js";
import { defaultRuntime } from "../runtime.js";
import { getCommandPathWithRootOptions, hasFlag, hasHelpOrVersion } from "./argv.js";
import { findRoutedCommand } from "./program/routes.js";

type RouteDeps = {
  findRoutedCommand: typeof findRoutedCommand;
  loadBannerModule: () => Promise<typeof import("./banner.js")>;
  loadVersionModule: () => Promise<typeof import("../version.js")>;
  loadConfigGuardModule: () => Promise<typeof import("./program/config-guard.js")>;
  loadPluginRegistryModule: () => Promise<typeof import("./plugin-registry.js")>;
};

const routeDeps: RouteDeps = {
  findRoutedCommand,
  loadBannerModule: () => import("./banner.js"),
  loadVersionModule: () => import("../version.js"),
  loadConfigGuardModule: () => import("./program/config-guard.js"),
  loadPluginRegistryModule: () => import("./plugin-registry.js"),
};

async function prepareRoutedCommand(params: {
  argv: string[];
  commandPath: string[];
  loadPlugins?: boolean | ((argv: string[]) => boolean);
}) {
  const suppressDoctorStdout = hasFlag(params.argv, "--json");
  const skipConfigGuard = params.commandPath[0] === "status" && suppressDoctorStdout;
  if (!suppressDoctorStdout && process.stdout.isTTY) {
    const [{ emitCliBanner }, { VERSION }] = await Promise.all([
      routeDeps.loadBannerModule(),
      routeDeps.loadVersionModule(),
    ]);
    emitCliBanner(VERSION, { argv: params.argv });
  }
  if (!skipConfigGuard) {
    const { ensureConfigReady } = await routeDeps.loadConfigGuardModule();
    await ensureConfigReady({
      runtime: defaultRuntime,
      commandPath: params.commandPath,
      ...(suppressDoctorStdout ? { suppressDoctorStdout: true } : {}),
    });
  }
  const shouldLoadPlugins =
    typeof params.loadPlugins === "function" ? params.loadPlugins(params.argv) : params.loadPlugins;
  if (shouldLoadPlugins) {
    const { ensurePluginRegistryLoaded } = await routeDeps.loadPluginRegistryModule();
    const prev = loggingState.forceConsoleToStderr;
    if (suppressDoctorStdout) {
      loggingState.forceConsoleToStderr = true;
    }
    try {
      ensurePluginRegistryLoaded({
        scope:
          params.commandPath[0] === "status" || params.commandPath[0] === "health"
            ? "channels"
            : "all",
      });
    } finally {
      loggingState.forceConsoleToStderr = prev;
    }
  }
}

export async function tryRouteCli(argv: string[]): Promise<boolean> {
  if (isTruthyEnvValue(process.env.OPENCLAW_DISABLE_ROUTE_FIRST)) {
    return false;
  }
  if (hasHelpOrVersion(argv)) {
    return false;
  }

  const path = getCommandPathWithRootOptions(argv, 2);
  if (!path[0]) {
    return false;
  }
  const route = routeDeps.findRoutedCommand(path);
  if (!route) {
    return false;
  }
  await prepareRoutedCommand({ argv, commandPath: path, loadPlugins: route.loadPlugins });
  return route.run(argv);
}

export const __testing = {
  setDepsForTest(overrides: Partial<RouteDeps>) {
    Object.assign(routeDeps, overrides);
  },
  resetDepsForTest() {
    routeDeps.findRoutedCommand = findRoutedCommand;
    routeDeps.loadBannerModule = () => import("./banner.js");
    routeDeps.loadVersionModule = () => import("../version.js");
    routeDeps.loadConfigGuardModule = () => import("./program/config-guard.js");
    routeDeps.loadPluginRegistryModule = () => import("./plugin-registry.js");
  },
};
