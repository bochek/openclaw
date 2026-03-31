import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  __testing as portsTesting,
  forceFreePort,
  forceFreePortAndWait,
  listPortListeners,
  type PortProcess,
  parseLsofOutput,
} from "./ports.js";

describe("gateway --force helpers", () => {
  let originalKill: typeof process.kill;
  let originalPlatform: NodeJS.Platform;
  let execFileSyncMock: Mock<(...args: unknown[]) => unknown>;
  let tryListenOnPortMock: Mock<(...args: unknown[]) => unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    originalKill = process.kill.bind(process);
    originalPlatform = process.platform;
    execFileSyncMock = vi.fn();
    tryListenOnPortMock = vi.fn();
    portsTesting.setDepsForTest({
      execFileSync: execFileSyncMock as typeof import("node:child_process").execFileSync,
      tryListenOnPort:
        tryListenOnPortMock as typeof import("../infra/ports-probe.js").tryListenOnPort,
    });
    // Pin to linux so all lsof tests are platform-invariant.
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    portsTesting.resetDepsForTest();
    process.kill = originalKill;
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("parses lsof output into pid/command pairs", () => {
    const sample = ["p123", "cnode", "p456", "cpython", ""].join("\n");
    const parsed = parseLsofOutput(sample);
    expect(parsed).toEqual<PortProcess[]>([
      { pid: 123, command: "node" },
      { pid: 456, command: "python" },
    ]);
  });

  it("returns empty list when lsof finds nothing", () => {
    execFileSyncMock.mockImplementation(() => {
      const err = new Error("no matches") as NodeJS.ErrnoException & { status?: number };
      err.status = 1; // lsof uses exit 1 for no matches
      throw err;
    });
    expect(listPortListeners(18789)).toEqual([]);
  });

  it("throws when lsof missing", () => {
    execFileSyncMock.mockImplementation(() => {
      const err = new Error("not found") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });
    expect(() => listPortListeners(18789)).toThrow(/lsof not found/);
  });

  it("kills each listener and returns metadata", () => {
    execFileSyncMock.mockReturnValue(["p42", "cnode", "p99", "cssh", ""].join("\n"));
    const killMock = vi.fn();
    process.kill = killMock;

    const killed = forceFreePort(18789);

    expect(execFileSyncMock).toHaveBeenCalled();
    expect(killMock).toHaveBeenCalledTimes(2);
    expect(killMock).toHaveBeenCalledWith(42, "SIGTERM");
    expect(killMock).toHaveBeenCalledWith(99, "SIGTERM");
    expect(killed).toEqual<PortProcess[]>([
      { pid: 42, command: "node" },
      { pid: 99, command: "ssh" },
    ]);
  });

  it("retries until the port is free", async () => {
    let call = 0;
    execFileSyncMock.mockImplementation(() => {
      call += 1;
      // 1st call: initial listeners to kill.
      // 2nd/3rd calls: still listed.
      // 4th call: gone.
      if (call === 1) {
        return ["p42", "cnode", ""].join("\n");
      }
      if (call === 2 || call === 3) {
        return ["p42", "cnode", ""].join("\n");
      }
      return "";
    });

    const killMock = vi.fn();
    process.kill = killMock;

    const promise = forceFreePortAndWait(18789, {
      timeoutMs: 5,
      intervalMs: 1,
      sigtermTimeoutMs: 4,
    });

    const res = await promise;

    expect(killMock).toHaveBeenCalledWith(42, "SIGTERM");
    expect(res.killed).toEqual<PortProcess[]>([{ pid: 42, command: "node" }]);
    expect(res.escalatedToSigkill).toBe(false);
    expect(res.waitedMs).toBe(1);
  });

  it("escalates to SIGKILL if SIGTERM doesn't free the port", async () => {
    let call = 0;
    execFileSyncMock.mockImplementation(() => {
      call += 1;
      // 1st call: initial kill list; then keep showing until after SIGKILL.
      if (call <= 7) {
        return ["p42", "cnode", ""].join("\n");
      }
      return "";
    });

    const killMock = vi.fn();
    process.kill = killMock;

    const promise = forceFreePortAndWait(18789, {
      timeoutMs: 8,
      intervalMs: 1,
      sigtermTimeoutMs: 3,
    });

    const res = await promise;

    expect(killMock).toHaveBeenCalledWith(42, "SIGTERM");
    expect(killMock).toHaveBeenCalledWith(42, "SIGKILL");
    expect(res.escalatedToSigkill).toBe(true);

  });

  it("falls back to fuser when lsof is permission denied", async () => {
    execFileSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes("lsof")) {
        const err = new Error("spawnSync lsof EACCES") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      }
      return "18789/tcp: 4242\n";
    });
    tryListenOnPortMock.mockResolvedValue(undefined);

    const result = await forceFreePortAndWait(18789, { timeoutMs: 500, intervalMs: 100 });

    expect(result.escalatedToSigkill).toBe(false);
    expect(result.killed).toEqual<PortProcess[]>([{ pid: 4242 }]);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "fuser",
      ["-k", "-TERM", "18789/tcp"],
      expect.objectContaining({ encoding: "utf-8" }),
    );
  });

  it("uses fuser SIGKILL escalation when port stays busy", async () => {
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd.includes("lsof")) {
        const err = new Error("spawnSync lsof EACCES") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      }
      if (args.includes("-TERM")) {
        return "18789/tcp: 1337\n";
      }
      if (args.includes("-KILL")) {
        return "18789/tcp: 1337\n";
      }
      return "";
    });

    const busyErr = Object.assign(new Error("in use"), { code: "EADDRINUSE" });
    tryListenOnPortMock
      .mockRejectedValueOnce(busyErr)
      .mockRejectedValueOnce(busyErr)
      .mockRejectedValueOnce(busyErr)
      .mockResolvedValueOnce(undefined);

    const promise = forceFreePortAndWait(18789, {
      timeoutMs: 3,
      intervalMs: 1,
      sigtermTimeoutMs: 1,
    });
    const result = await promise;

    expect(result.escalatedToSigkill).toBe(true);
    expect(result.waitedMs).toBe(1);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "fuser",
      ["-k", "-KILL", "18789/tcp"],
      expect.objectContaining({ encoding: "utf-8" }),
    );
  });

  it("throws when lsof is unavailable and fuser is missing", async () => {
    execFileSyncMock.mockImplementation((cmd: string) => {
      const err = new Error(`spawnSync ${cmd} ENOENT`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    await expect(forceFreePortAndWait(18789, { timeoutMs: 200, intervalMs: 100 })).rejects.toThrow(
      /fuser not found/i,
    );
  });
});

describe("gateway --force helpers (Windows netstat path)", () => {
  let originalKill: typeof process.kill;
  let originalPlatform: NodeJS.Platform;
  let execFileSyncMock: Mock<(...args: unknown[]) => unknown>;
  let tryListenOnPortMock: Mock<(...args: unknown[]) => unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    originalKill = process.kill.bind(process);
    originalPlatform = process.platform;
    execFileSyncMock = vi.fn();
    tryListenOnPortMock = vi.fn();
    portsTesting.setDepsForTest({
      execFileSync: execFileSyncMock as typeof import("node:child_process").execFileSync,
      tryListenOnPort:
        tryListenOnPortMock as typeof import("../infra/ports-probe.js").tryListenOnPort,
    });
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  });

  afterEach(() => {
    portsTesting.resetDepsForTest();
    process.kill = originalKill;
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  const makeNetstatOutput = (port: number, ...pids: number[]) =>
    [
      "Proto  Local Address          Foreign Address        State           PID",
      ...pids.map(
        (pid) => `  TCP    0.0.0.0:${port}           0.0.0.0:0              LISTENING       ${pid}`,
      ),
    ].join("\r\n");

  it("returns empty list when netstat finds no listeners on the port", () => {
    execFileSyncMock.mockReturnValue(makeNetstatOutput(9999, 42));
    expect(listPortListeners(18789)).toEqual([]);
  });

  it("parses PIDs from netstat output correctly", () => {
    execFileSyncMock.mockReturnValue(makeNetstatOutput(18789, 42, 99));
    expect(listPortListeners(18789)).toEqual<PortProcess[]>([{ pid: 42 }, { pid: 99 }]);
  });

  it("does not incorrectly match a port that is a substring (e.g. 80 vs 8080)", () => {
    execFileSyncMock.mockReturnValue(makeNetstatOutput(8080, 42));
    expect(listPortListeners(80)).toEqual([]);
  });

  it("deduplicates PIDs that appear multiple times", () => {
    execFileSyncMock.mockReturnValue(makeNetstatOutput(18789, 42, 42));
    expect(listPortListeners(18789)).toEqual<PortProcess[]>([{ pid: 42 }]);
  });

  it("throws a descriptive error when netstat fails", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("access denied");
    });
    expect(() => listPortListeners(18789)).toThrow(/netstat failed/);
  });

  it("kills Windows listeners and returns metadata", () => {
    execFileSyncMock.mockReturnValue(makeNetstatOutput(18789, 42, 99));
    const killMock = vi.fn();
    process.kill = killMock;

    const killed = forceFreePort(18789);

    expect(killMock).toHaveBeenCalledTimes(2);
    expect(killMock).toHaveBeenCalledWith(42, "SIGTERM");
    expect(killMock).toHaveBeenCalledWith(99, "SIGTERM");
    expect(killed).toEqual<PortProcess[]>([{ pid: 42 }, { pid: 99 }]);
  });
});
