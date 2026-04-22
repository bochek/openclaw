import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/plugins/plugin-api.js";
import plugin from "./index.js";

describe("googlemeet plugin", () => {
  it("registers the googlemeet cli surface", () => {
    const registerCli = vi.fn();
    const api = createTestPluginApi({
      id: "googlemeet",
      name: "Google Meet",
      source: "test",
      config: {},
      runtime: {} as never,
      registerCli,
    });

    plugin.register(api);

    expect(registerCli).toHaveBeenCalledTimes(1);
    expect(registerCli.mock.calls[0]?.[1]).toMatchObject({
      descriptors: [
        expect.objectContaining({
          name: "googlemeet",
          hasSubcommands: true,
        }),
      ],
    });
  });
});
