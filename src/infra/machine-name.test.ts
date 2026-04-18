import os from "node:os";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async () => {
  const { mockNodeBuiltinModule } = await import("../../test/helpers/node-builtin-mocks.js");
  return mockNodeBuiltinModule(
    () => vi.importActual<typeof import("node:child_process")>("node:child_process"),
    {
      execFile: Object.assign(execFileMock, {
        __promisify__: vi.fn(),
      }) as typeof import("node:child_process").execFile,
    },
  );
});

const originalVitest = process.env.VITEST;
const originalNodeEnv = process.env.NODE_ENV;

type MachineNameModule = typeof import("./machine-name.js");

let machineName: MachineNameModule;

beforeAll(async () => {
  machineName = await import("./machine-name.js");
});

beforeEach(() => {
  machineName.resetMachineDisplayNameCacheForTest();
});

afterEach(() => {
  execFileMock.mockReset();
  vi.restoreAllMocks();
  if (originalVitest === undefined) {
    delete process.env.VITEST;
  } else {
    process.env.VITEST = originalVitest;
  }
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("getMachineDisplayName", () => {
  it.each([
    {
      name: "uses the hostname fallback in test mode and strips a trimmed .local suffix",
      scope: "test-fallback",
      hostname: "  clawbox.LOCAL  ",
      expected: "clawbox",
      expectedCalls: 1,
      repeatLookup: true,
    },
    {
      name: "falls back to the default product name when hostname is blank",
      scope: "blank-hostname",
      hostname: "   ",
      expected: "openclaw",
      expectedCalls: 1,
      repeatLookup: false,
    },
  ])("$name", async ({ scope, hostname, expected, expectedCalls, repeatLookup }) => {
    const hostnameSpy = vi.spyOn(os, "hostname").mockReturnValue(hostname);
    void scope;

    await expect(machineName.getMachineDisplayName()).resolves.toBe(expected);
    if (repeatLookup) {
      await expect(machineName.getMachineDisplayName()).resolves.toBe(expected);
    }
    expect(hostnameSpy).toHaveBeenCalledTimes(expectedCalls);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
