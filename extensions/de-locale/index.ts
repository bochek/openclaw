import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "de-locale",
  name: "German Locale Prototype",
  description: "Prototype German locale artifact for docs materialization.",
  register() {
    // Transitional compatibility entry only. Locale resources are consumed via
    // locale-aware docs sync and gateway delivery, not runtime capability hooks.
  },
});
