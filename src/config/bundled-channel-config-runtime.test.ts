import { afterEach, describe, expect, it } from "vitest";
import {
  __testing as bundledChannelConfigRuntimeTesting,
  getBundledChannelConfigSchemaMap,
  getBundledChannelRuntimeMap,
} from "./bundled-channel-config-runtime.js";

describe("bundled channel config runtime", () => {
  afterEach(() => {
    bundledChannelConfigRuntimeTesting.resetDepsForTest();
  });

  it("tolerates an unavailable bundled channel list during import", async () => {
    bundledChannelConfigRuntimeTesting.setDepsForTest({
      readBundledChannelPluginsExport: () => undefined,
    });

    expect(getBundledChannelConfigSchemaMap().get("msteams")).toBeDefined();
    expect(getBundledChannelRuntimeMap().get("msteams")).toBeDefined();
  });

  it("falls back to static channel schemas when bundled plugin access hits a TDZ-style ReferenceError", async () => {
    bundledChannelConfigRuntimeTesting.setDepsForTest({
      readBundledChannelPluginsExport: () => {
        throw new ReferenceError("Cannot access 'bundledChannelPlugins' before initialization.");
      },
    });

    const configSchemaMap = getBundledChannelConfigSchemaMap();

    expect(configSchemaMap.has("msteams")).toBe(true);
    expect(configSchemaMap.has("whatsapp")).toBe(true);
  });
});
