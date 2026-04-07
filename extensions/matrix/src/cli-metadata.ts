import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createLazyPluginLocalModule } from "openclaw/plugin-sdk/lazy-runtime";

const loadMatrixCliModule = createLazyPluginLocalModule<typeof import("./cli.js")>(
  import.meta.url,
  "./cli.js",
);

export function registerMatrixCliMetadata(api: OpenClawPluginApi) {
  api.registerCli(
    async ({ program }) => {
      const { registerMatrixCli } = await loadMatrixCliModule();
      registerMatrixCli({ program });
    },
    {
      descriptors: [
        {
          name: "matrix",
          description: "Manage Matrix accounts, verification, devices, and profile state",
          hasSubcommands: true,
        },
      ],
    },
  );
}
