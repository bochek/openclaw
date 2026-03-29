import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/plugins/plugin-api.js";

const cliMocks = vi.hoisted(() => ({
  registerMatrixCli: vi.fn(),
}));

vi.mock("./src/cli.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./src/cli.js")>();
  return {
    ...actual,
    registerMatrixCli: cliMocks.registerMatrixCli,
  };
});

import matrixPlugin from "./index.js";

describe("matrix plugin", () => {
  it("registers matrix CLI synchronously", () => {
    const registerCli = vi.fn();
    const api = createTestPluginApi({
      id: "matrix",
      name: "Matrix",
      source: "test",
      config: {},
      runtime: {} as never,
      registerCli,
    });

    matrixPlugin.register(api);

    const registrar = registerCli.mock.calls[0]?.[0];
    expect(registerCli).toHaveBeenCalledWith(expect.any(Function), { commands: ["matrix"] });
    expect(typeof registrar).toBe("function");

    const program = { command: vi.fn() };
    const result = registrar?.({ program } as never);

    expect(result).toBeUndefined();
    expect(cliMocks.registerMatrixCli).toHaveBeenCalledWith({ program });
  });
});
