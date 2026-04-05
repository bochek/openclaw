import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/plugins/plugin-api.js";
import matrixPlugin from "./index.js";

type CommandNode = {
  command: ReturnType<typeof vi.fn>;
} & Record<string, ReturnType<typeof vi.fn>>;

function createCommandNode(): CommandNode {
  const methods = new Map<string, ReturnType<typeof vi.fn>>();
  let node = {} as CommandNode;
  node = new Proxy(node, {
    get(_target, prop) {
      if (typeof prop !== "string") {
        return undefined;
      }
      const existing = methods.get(prop);
      if (existing) {
        return existing;
      }
      const fn = prop === "command" ? vi.fn(() => createCommandNode()) : vi.fn(() => node);
      methods.set(prop, fn);
      return fn;
    },
  }) as CommandNode;
  return node;
}

describe("matrix plugin", () => {
  it("registers matrix CLI through a descriptor-backed lazy registrar", async () => {
    const registerCli = vi.fn();
    const registerGatewayMethod = vi.fn();
    const api = createTestPluginApi({
      id: "matrix",
      name: "Matrix",
      source: "test",
      config: {},
      runtime: {} as never,
      registrationMode: "cli-metadata",
      registerCli,
      registerGatewayMethod,
    });

    matrixPlugin.register(api);

    const registrar = registerCli.mock.calls[0]?.[0];
    expect(registerCli).toHaveBeenCalledWith(expect.any(Function), {
      descriptors: [
        {
          name: "matrix",
          description: "Manage Matrix accounts, verification, devices, and profile state",
          hasSubcommands: true,
        },
      ],
    });
    expect(typeof registrar).toBe("function");

    const program = createCommandNode();
    const result = registrar?.({ program } as never);

    await result;
    expect(program.command).toHaveBeenCalledWith("matrix");
    expect(registerGatewayMethod).not.toHaveBeenCalled();
  });

  it("keeps runtime bootstrap and CLI metadata out of setup-only registration", () => {
    const registerCli = vi.fn();
    const registerGatewayMethod = vi.fn();
    const api = createTestPluginApi({
      id: "matrix",
      name: "Matrix",
      source: "test",
      config: {},
      runtime: {} as never,
      registrationMode: "setup-only",
      registerCli,
      registerGatewayMethod,
    });

    matrixPlugin.register(api);

    expect(registerCli).not.toHaveBeenCalled();
    expect(registerGatewayMethod).not.toHaveBeenCalled();
  });
});
