import { GENERATED_BUNDLED_CHANNEL_ENTRIES } from "../../generated/bundled-channel-entries.generated.js";
import type { PluginRuntime } from "../../plugins/runtime/types.js";
import type { ChannelId, ChannelPlugin } from "./types.js";

type GeneratedBundledChannelEntry = {
  id: string;
  entry: {
    channelPlugin: ChannelPlugin;
    setChannelRuntime?: (runtime: PluginRuntime) => void;
  };
  setupEntry?: {
    plugin: ChannelPlugin;
  };
};

type BundledChannelState = {
  plugins: ChannelPlugin[];
  setupPlugins: ChannelPlugin[];
  pluginsById: Map<ChannelId, ChannelPlugin>;
  runtimeSettersById: Map<
    ChannelId,
    NonNullable<GeneratedBundledChannelEntry["entry"]["setChannelRuntime"]>
  >;
};

function isGeneratedBundledChannelEntry(value: unknown): value is GeneratedBundledChannelEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as {
    id?: unknown;
    entry?: {
      channelPlugin?: { id?: unknown };
      setChannelRuntime?: unknown;
    };
    setupEntry?: { plugin?: { id?: unknown } };
  };
  return typeof record.id === "string" && typeof record.entry?.channelPlugin?.id === "string";
}

let bundledChannelState: BundledChannelState | null = null;
let bundledChannelStateInitializing = false;
const emptyBundledChannelState: BundledChannelState = {
  plugins: [],
  setupPlugins: [],
  pluginsById: new Map(),
  runtimeSettersById: new Map(),
};

function getGeneratedBundledChannelEntries(): readonly GeneratedBundledChannelEntry[] {
  return (
    Array.isArray(GENERATED_BUNDLED_CHANNEL_ENTRIES)
      ? GENERATED_BUNDLED_CHANNEL_ENTRIES.filter(isGeneratedBundledChannelEntry)
      : []
  ) as readonly GeneratedBundledChannelEntry[];
}

function buildBundledChannelPluginsById(plugins: readonly ChannelPlugin[]) {
  const byId = new Map<ChannelId, ChannelPlugin>();
  for (const plugin of plugins) {
    if (byId.has(plugin.id)) {
      throw new Error(`duplicate bundled channel plugin id: ${plugin.id}`);
    }
    byId.set(plugin.id, plugin);
  }
  return byId;
}

function getBundledChannelState(): BundledChannelState {
  if (bundledChannelState) {
    return bundledChannelState;
  }
  if (bundledChannelStateInitializing) {
    return emptyBundledChannelState;
  }

  bundledChannelStateInitializing = true;
  try {
    const generatedBundledChannelEntries = getGeneratedBundledChannelEntries();
    const plugins = generatedBundledChannelEntries.map(({ entry }) => entry.channelPlugin);
    const setupPlugins = generatedBundledChannelEntries.flatMap(({ setupEntry }) =>
      setupEntry ? [setupEntry.plugin] : [],
    );
    const runtimeSettersById = new Map<
      ChannelId,
      NonNullable<GeneratedBundledChannelEntry["entry"]["setChannelRuntime"]>
    >();
    for (const { entry } of generatedBundledChannelEntries) {
      if (entry.setChannelRuntime) {
        runtimeSettersById.set(entry.channelPlugin.id, entry.setChannelRuntime);
      }
    }

    bundledChannelState = {
      plugins,
      setupPlugins,
      pluginsById: buildBundledChannelPluginsById(plugins),
      runtimeSettersById,
    };
    return bundledChannelState;
  } finally {
    bundledChannelStateInitializing = false;
  }
}

function createLazyBundledPluginArray(
  select: (state: BundledChannelState) => ChannelPlugin[],
): ChannelPlugin[] {
  return new Proxy([] as ChannelPlugin[], {
    get(_target, property) {
      const array = select(getBundledChannelState());
      const value = Reflect.get(array, property, array);
      return typeof value === "function" ? value.bind(array) : value;
    },
    getOwnPropertyDescriptor(_target, property) {
      return Object.getOwnPropertyDescriptor(select(getBundledChannelState()), property);
    },
    has(_target, property) {
      return Reflect.has(select(getBundledChannelState()), property);
    },
    ownKeys() {
      return Reflect.ownKeys(select(getBundledChannelState()));
    },
  });
}

export const bundledChannelPlugins = createLazyBundledPluginArray((state) => state.plugins);

export const bundledChannelSetupPlugins = createLazyBundledPluginArray(
  (state) => state.setupPlugins,
);

export function listBundledChannelPlugins(): ChannelPlugin[] {
  return [...getBundledChannelState().plugins];
}

export function listBundledChannelSetupPlugins(): ChannelPlugin[] {
  return [...getBundledChannelState().setupPlugins];
}

export function getBundledChannelPlugin(id: ChannelId): ChannelPlugin | undefined {
  return getBundledChannelState().pluginsById.get(id);
}

export function requireBundledChannelPlugin(id: ChannelId): ChannelPlugin {
  const plugin = getBundledChannelPlugin(id);
  if (!plugin) {
    throw new Error(`missing bundled channel plugin: ${id}`);
  }
  return plugin;
}

export function setBundledChannelRuntime(id: ChannelId, runtime: PluginRuntime): void {
  const setter = getBundledChannelState().runtimeSettersById.get(id);
  if (!setter) {
    throw new Error(`missing bundled channel runtime setter: ${id}`);
  }
  setter(runtime);
}
