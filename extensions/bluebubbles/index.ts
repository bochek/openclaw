import {
  emptyPluginConfigSchema,
  type ChannelPlugin,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/core";
import * as bluebubblesChannelModule from "./src/channel.js";
import * as bluebubblesRuntimeModule from "./src/runtime.js";

export { bluebubblesPlugin } from "./src/channel.js";
export { setBlueBubblesRuntime } from "./src/runtime.js";

const bluebubblesEntry = {
  id: "bluebubbles",
  name: "BlueBubbles",
  description: "BlueBubbles channel plugin (macOS app)",
  configSchema: emptyPluginConfigSchema,
  register(api: OpenClawPluginApi) {
    bluebubblesRuntimeModule.setBlueBubblesRuntime(api.runtime);
    api.registerChannel({ plugin: bluebubblesChannelModule.bluebubblesPlugin as ChannelPlugin });
  },
  get channelPlugin() {
    return bluebubblesChannelModule.bluebubblesPlugin;
  },
  setChannelRuntime: bluebubblesRuntimeModule.setBlueBubblesRuntime,
};

export default bluebubblesEntry;
