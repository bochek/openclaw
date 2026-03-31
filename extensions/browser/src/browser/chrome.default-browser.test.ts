import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __testing,
  resolveBrowserExecutableForPlatform,
} from "./chrome.executables.js";

const execFileSyncMock = vi.fn();
const existsSyncMock = vi.fn();
const homedirMock = vi.fn();
const readFileSyncMock = vi.fn();

describe("browser default executable detection", () => {
  const launchServicesPlist = "com.apple.launchservices.secure.plist";
  const chromeExecutablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  function mockMacDefaultBrowser(bundleId: string, appPath = ""): void {
    execFileSyncMock.mockImplementation((cmd, args) => {
      const argsStr = Array.isArray(args) ? args.join(" ") : "";
      if (cmd === "/usr/bin/plutil" && argsStr.includes("LSHandlers")) {
        return JSON.stringify([{ LSHandlerURLScheme: "http", LSHandlerRoleAll: bundleId }]);
      }
      if (cmd === "/usr/bin/osascript" && argsStr.includes("path to application id")) {
        return appPath;
      }
      if (cmd === "/usr/bin/defaults") {
        return "Google Chrome";
      }
      return "";
    });
  }

  function mockChromeExecutableExists(): void {
    existsSyncMock.mockImplementation((p) => {
      const value = String(p);
      if (value.includes(launchServicesPlist)) {
        return true;
      }
      return value.includes(chromeExecutablePath);
    });
  }

  beforeEach(() => {
    execFileSyncMock.mockReset();
    existsSyncMock.mockReset();
    homedirMock.mockReset();
    readFileSyncMock.mockReset();
    homedirMock.mockReturnValue("/Users/test");
    __testing.setDepsForTest({
      execFileSync: execFileSyncMock as unknown as typeof import("node:child_process").execFileSync,
      existsSync: existsSyncMock as unknown as typeof import("node:fs").existsSync,
      homedir: homedirMock as unknown as typeof import("node:os").homedir,
      readFileSync: readFileSyncMock as unknown as typeof import("node:fs").readFileSync,
    });
  });

  afterEach(() => {
    __testing.setDepsForTest();
  });

  it("prefers default Chromium browser on macOS", () => {
    mockMacDefaultBrowser("com.google.Chrome", "/Applications/Google Chrome.app");
    mockChromeExecutableExists();

    const exe = resolveBrowserExecutableForPlatform(
      {} as Parameters<typeof resolveBrowserExecutableForPlatform>[0],
      "darwin",
    );

    expect(exe?.path).toContain("Google Chrome.app/Contents/MacOS/Google Chrome");
    expect(exe?.kind).toBe("chrome");
  });

  it("detects Edge via LaunchServices bundle ID (com.microsoft.edgemac)", () => {
    const edgeExecutablePath = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
    execFileSyncMock.mockImplementation((cmd, args) => {
      const argsStr = Array.isArray(args) ? args.join(" ") : "";
      if (cmd === "/usr/bin/plutil" && argsStr.includes("LSHandlers")) {
        return JSON.stringify([
          { LSHandlerURLScheme: "http", LSHandlerRoleAll: "com.microsoft.edgemac" },
        ]);
      }
      if (cmd === "/usr/bin/osascript" && argsStr.includes("path to application id")) {
        return "/Applications/Microsoft Edge.app/";
      }
      if (cmd === "/usr/bin/defaults") {
        return "Microsoft Edge";
      }
      return "";
    });
    existsSyncMock.mockImplementation((p) => {
      const value = String(p);
      if (value.includes(launchServicesPlist)) {
        return true;
      }
      return value === edgeExecutablePath || value.includes(chromeExecutablePath);
    });

    const exe = resolveBrowserExecutableForPlatform(
      {} as Parameters<typeof resolveBrowserExecutableForPlatform>[0],
      "darwin",
    );

    expect(exe?.path).toBe(edgeExecutablePath);
    expect(exe?.kind).toBe("edge");
  });

  it("falls back to Chrome when Edge LaunchServices lookup has no app path", () => {
    execFileSyncMock.mockImplementation((cmd, args) => {
      const argsStr = Array.isArray(args) ? args.join(" ") : "";
      if (cmd === "/usr/bin/plutil" && argsStr.includes("LSHandlers")) {
        return JSON.stringify([
          { LSHandlerURLScheme: "http", LSHandlerRoleAll: "com.microsoft.edgemac" },
        ]);
      }
      if (cmd === "/usr/bin/osascript" && argsStr.includes("path to application id")) {
        return "";
      }
      return "";
    });
    mockChromeExecutableExists();

    const exe = resolveBrowserExecutableForPlatform(
      {} as Parameters<typeof resolveBrowserExecutableForPlatform>[0],
      "darwin",
    );

    expect(exe?.path).toContain("Google Chrome.app/Contents/MacOS/Google Chrome");
    expect(exe?.kind).toBe("chrome");
  });

  it("falls back when default browser is non-Chromium on macOS", () => {
    mockMacDefaultBrowser("com.apple.Safari");
    mockChromeExecutableExists();

    const exe = resolveBrowserExecutableForPlatform(
      {} as Parameters<typeof resolveBrowserExecutableForPlatform>[0],
      "darwin",
    );

    expect(exe?.path).toContain("Google Chrome.app/Contents/MacOS/Google Chrome");
  });
});
