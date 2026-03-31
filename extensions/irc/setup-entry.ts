import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { ircSetupPlugin } from "./src/channel.setup.js";

export { ircSetupPlugin } from "./src/channel.setup.js";

export default defineSetupPluginEntry(ircSetupPlugin);
