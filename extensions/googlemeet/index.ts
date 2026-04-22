import { definePluginEntry } from "./api.js";
import { registerGoogleMeetCli } from "./src/cli.js";
import { googleMeetPluginConfigSchema, resolveGoogleMeetPluginConfig } from "./src/config.js";

export default definePluginEntry({
  id: "googlemeet",
  name: "Google Meet",
  description: "Experimental Google Meet media-ingest groundwork.",
  configSchema: googleMeetPluginConfigSchema,
  register(api) {
    const pluginConfig = resolveGoogleMeetPluginConfig(api.pluginConfig);
    api.registerCli(
      ({ program }) => {
        registerGoogleMeetCli({
          program,
          pluginConfig,
        });
      },
      {
        descriptors: [
          {
            name: "googlemeet",
            description: "Google Meet OAuth and media preflight helpers",
            hasSubcommands: true,
          },
        ],
      },
    );
  },
});
