import { beforeEach, describe, expect, it, vi } from "vitest";
import { __testing, createZalo } from "./zca-client.js";

describe("zca-client runtime loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testing.resetDepsForTest();
  });

  it("does not import zca-js until a session is created", async () => {
    const runtimeFactory = vi.fn(() => ({
      Zalo: class MockZalo {
        constructor(public readonly options?: { logging?: boolean; selfListen?: boolean }) {}
      },
    }));

    __testing.setDepsForTest({
      loadRuntime: async () => runtimeFactory(),
    });
    expect(runtimeFactory).not.toHaveBeenCalled();

    const client = await createZalo({ logging: false, selfListen: true });

    expect(runtimeFactory).toHaveBeenCalledTimes(1);
    expect(client).toMatchObject({
      options: { logging: false, selfListen: true },
    });
  });
});
