import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBundledBrowserPluginFixture } from "../../test/helpers/browser-bundled-plugin-fixture.js";
import type { OpenClawConfig } from "../config/config.js";

describe("createOpenClawTools browser plugin integration", () => {
  let bundledFixture: ReturnType<typeof createBundledBrowserPluginFixture> | null = null;
  const originalBundledPluginsDir = process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;
  let pluginEnv: NodeJS.ProcessEnv;
  let clearPluginDiscoveryCache: typeof import("../plugins/discovery.js").clearPluginDiscoveryCache;
  let loadOpenClawPlugins: typeof import("../plugins/loader.js").loadOpenClawPlugins;
  let clearPluginLoaderCache: typeof import("../plugins/loader.js").clearPluginLoaderCache;
  let clearPluginManifestRegistryCache: typeof import("../plugins/manifest-registry.js").clearPluginManifestRegistryCache;
  let resetPluginRuntimeStateForTest: typeof import("../plugins/runtime.js").resetPluginRuntimeStateForTest;

  function resetPluginState() {
    clearPluginLoaderCache();
    clearPluginDiscoveryCache();
    clearPluginManifestRegistryCache();
    resetPluginRuntimeStateForTest();
  }

  beforeEach(async () => {
    vi.resetModules();
    ({ clearPluginDiscoveryCache } = await import("../plugins/discovery.js"));
    ({ clearPluginLoaderCache, loadOpenClawPlugins } = await import("../plugins/loader.js"));
    ({ clearPluginManifestRegistryCache } = await import("../plugins/manifest-registry.js"));
    ({ resetPluginRuntimeStateForTest } = await import("../plugins/runtime.js"));
    bundledFixture = createBundledBrowserPluginFixture();
    vi.stubEnv("OPENCLAW_BUNDLED_PLUGINS_DIR", bundledFixture.rootDir);
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = bundledFixture.rootDir;
    pluginEnv = {
      ...process.env,
      OPENCLAW_BUNDLED_PLUGINS_DIR: bundledFixture.rootDir,
    };
    resetPluginState();
  });

  afterEach(() => {
    resetPluginState();
    vi.unstubAllEnvs();
    if (originalBundledPluginsDir === undefined) {
      delete process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;
    } else {
      process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = originalBundledPluginsDir;
    }
    bundledFixture?.cleanup();
    bundledFixture = null;
  });

  it("loads the bundled browser plugin tool through normal plugin resolution", () => {
    const config = {
      plugins: {
        allow: ["browser"],
      },
    } as OpenClawConfig;
    const registry = loadOpenClawPlugins({
      config,
      cache: false,
      env: pluginEnv,
      workspaceDir: process.cwd(),
    });

    expect(registry.tools.some((entry) => entry.pluginId === "browser")).toBe(true);
  });

  it("omits the browser tool when the bundled browser plugin is disabled", () => {
    const config = {
      plugins: {
        allow: ["browser"],
        entries: {
          browser: {
            enabled: false,
          },
        },
      },
    } as OpenClawConfig;
    const registry = loadOpenClawPlugins({
      config,
      cache: false,
      env: pluginEnv,
      workspaceDir: process.cwd(),
    });

    expect(registry.tools.some((entry) => entry.pluginId === "browser")).toBe(false);
  });
});
