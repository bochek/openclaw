import { afterEach, describe, expect, it } from "vitest";
import {
  clearExtensionHostPluginCommands,
  getExtensionHostPluginCommandSpecs,
  listExtensionHostPluginCommands,
  registerExtensionHostPluginCommand,
} from "./command-runtime.js";

afterEach(() => {
  clearExtensionHostPluginCommands();
});

describe("extension host command runtime", () => {
  it("rejects malformed runtime command shapes", () => {
    const invalidName = registerExtensionHostPluginCommand("demo-plugin", {
      name: undefined as unknown as string,
      description: "Demo",
      handler: async () => ({ text: "ok" }),
    });
    expect(invalidName).toEqual({
      ok: false,
      error: "Command name must be a string",
    });

    const invalidDescription = registerExtensionHostPluginCommand("demo-plugin", {
      name: "demo",
      description: undefined as unknown as string,
      handler: async () => ({ text: "ok" }),
    });
    expect(invalidDescription).toEqual({
      ok: false,
      error: "Command description must be a string",
    });
  });

  it("normalizes command metadata for downstream consumers", () => {
    const result = registerExtensionHostPluginCommand("demo-plugin", {
      name: "  demo_cmd  ",
      description: "  Demo command  ",
      handler: async () => ({ text: "ok" }),
    });
    expect(result).toEqual({ ok: true });
    expect(listExtensionHostPluginCommands()).toEqual([
      {
        name: "demo_cmd",
        description: "Demo command",
        pluginId: "demo-plugin",
      },
    ]);
    expect(getExtensionHostPluginCommandSpecs()).toEqual([
      {
        name: "demo_cmd",
        description: "Demo command",
        acceptsArgs: false,
      },
    ]);
  });

  it("supports provider-specific native command aliases", () => {
    const result = registerExtensionHostPluginCommand("demo-plugin", {
      name: "voice",
      nativeNames: {
        default: "talkvoice",
        discord: "discordvoice",
      },
      description: "Demo command",
      handler: async () => ({ text: "ok" }),
    });

    expect(result).toEqual({ ok: true });
    expect(getExtensionHostPluginCommandSpecs()).toEqual([
      {
        name: "talkvoice",
        description: "Demo command",
        acceptsArgs: false,
      },
    ]);
    expect(getExtensionHostPluginCommandSpecs("discord")).toEqual([
      {
        name: "discordvoice",
        description: "Demo command",
        acceptsArgs: false,
      },
    ]);
    expect(getExtensionHostPluginCommandSpecs("telegram")).toEqual([
      {
        name: "talkvoice",
        description: "Demo command",
        acceptsArgs: false,
      },
    ]);
  });
});
