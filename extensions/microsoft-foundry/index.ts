import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildMicrosoftFoundryProvider } from "./provider.js";
import { buildMicrosoftFoundryRealtimeTranscriptionProvider } from "./realtime-transcription-provider.js";

export default definePluginEntry({
  id: "microsoft-foundry",
  name: "Microsoft Foundry Provider",
  description: "Microsoft Foundry provider with Entra ID and API key auth",
  register(api) {
    api.registerProvider(buildMicrosoftFoundryProvider());
    api.registerRealtimeTranscriptionProvider(buildMicrosoftFoundryRealtimeTranscriptionProvider());
  },
});
