import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBrowserConfig } from "./config.js";
import { createBrowserProfilesService } from "./profiles-service.js";
import type { BrowserRouteContext, BrowserServerState } from "./server-context.js";

const configMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  writeConfigFile: vi.fn(async () => {}),
}));

const chromeMocks = vi.hoisted(() => ({
  resolveOpenClawUserDataDir: vi.fn(() => "/tmp/openclaw-test/openclaw/user-data"),
}));

const trashMocks = vi.hoisted(() => ({
  movePathToTrash: vi.fn(async (targetPath: string) => targetPath),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: configMocks.loadConfig,
    writeConfigFile: configMocks.writeConfigFile,
  };
});

vi.mock("./trash.js", () => trashMocks);

vi.mock("./chrome.js", () => chromeMocks);

function createCtx(resolved: BrowserServerState["resolved"]) {
  const state: BrowserServerState = {
    server: null as unknown as BrowserServerState["server"],
    port: 0,
    resolved,
    profiles: new Map(),
  };

  const ctx = {
    state: () => state,
    listProfiles: vi.fn(async () => []),
    forProfile: vi.fn(() => ({
      stopRunningBrowser: vi.fn(async () => ({ stopped: true })),
    })),
  } as unknown as BrowserRouteContext;

  return { state, ctx };
}

async function createWorkProfileWithConfig(params: {
  resolved: BrowserServerState["resolved"];
  browserConfig: Record<string, unknown>;
}) {
  const { ctx, state } = createCtx(params.resolved);
  configMocks.loadConfig.mockReturnValue({ browser: params.browserConfig });
  const service = createBrowserProfilesService(ctx);
  const result = await service.createProfile({ name: "work" });
  return { result, state };
}

describe("BrowserProfilesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMocks.loadConfig.mockReset();
    configMocks.writeConfigFile.mockReset();
    chromeMocks.resolveOpenClawUserDataDir.mockReset();
    trashMocks.movePathToTrash.mockReset();
    configMocks.writeConfigFile.mockResolvedValue(undefined);
    chromeMocks.resolveOpenClawUserDataDir.mockReturnValue("/tmp/openclaw-test/openclaw/user-data");
    trashMocks.movePathToTrash.mockImplementation(async (targetPath: string) => targetPath);
  });

  it("allocates next local port for new profiles", async () => {
    const { result, state } = await createWorkProfileWithConfig({
      resolved: resolveBrowserConfig({}),
      browserConfig: { profiles: {} },
    });

    expect(result.cdpPort).toBe(18801);
    expect(result.isRemote).toBe(false);
    expect(state.resolved.profiles.work?.cdpPort).toBe(18801);
    expect(configMocks.writeConfigFile).toHaveBeenCalled();
  });

  it("falls back to derived CDP range when resolved CDP range is missing", async () => {
    const base = resolveBrowserConfig({});
    const baseWithoutRange = { ...base } as {
      [key: string]: unknown;
      cdpPortRangeStart?: unknown;
      cdpPortRangeEnd?: unknown;
    };
    delete baseWithoutRange.cdpPortRangeStart;
    delete baseWithoutRange.cdpPortRangeEnd;
    const resolved = {
      ...baseWithoutRange,
      controlPort: 30000,
    } as BrowserServerState["resolved"];
    const { result, state } = await createWorkProfileWithConfig({
      resolved,
      browserConfig: { profiles: {} },
    });

    expect(result.cdpPort).toBe(30009);
    expect(state.resolved.profiles.work?.cdpPort).toBe(30009);
    expect(configMocks.writeConfigFile).toHaveBeenCalled();
  });

  it("allocates from configured cdpPortRangeStart for new local profiles", async () => {
    const { result, state } = await createWorkProfileWithConfig({
      resolved: resolveBrowserConfig({ cdpPortRangeStart: 19000 }),
      browserConfig: { cdpPortRangeStart: 19000, profiles: {} },
    });

    expect(result.cdpPort).toBe(19001);
    expect(result.isRemote).toBe(false);
    expect(state.resolved.profiles.work?.cdpPort).toBe(19001);
    expect(configMocks.writeConfigFile).toHaveBeenCalled();
  });

  it("accepts per-profile cdpUrl for remote Chrome", async () => {
    const resolved = resolveBrowserConfig({});
    const { ctx } = createCtx(resolved);

    configMocks.loadConfig.mockReturnValue({ browser: { profiles: {} } });

    const service = createBrowserProfilesService(ctx);
    const result = await service.createProfile({
      name: "remote",
      cdpUrl: "http://10.0.0.42:9222",
    });

    expect(result.cdpUrl).toBe("http://10.0.0.42:9222");
    expect(result.cdpPort).toBe(9222);
    expect(result.isRemote).toBe(true);
    expect(configMocks.writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        browser: expect.objectContaining({
          profiles: expect.objectContaining({
            remote: expect.objectContaining({
              cdpUrl: "http://10.0.0.42:9222",
            }),
          }),
        }),
      }),
    );
  });

  it("creates existing-session profiles as attach-only local entries", async () => {
    const resolved = resolveBrowserConfig({});
    const { ctx, state } = createCtx(resolved);
    configMocks.loadConfig.mockReturnValue({ browser: { profiles: {} } });

    const service = createBrowserProfilesService(ctx);
    const result = await service.createProfile({
      name: "chrome-live",
      driver: "existing-session",
    });

    expect(result.transport).toBe("chrome-mcp");
    expect(result.cdpPort).toBeNull();
    expect(result.cdpUrl).toBeNull();
    expect(result.userDataDir).toBeNull();
    expect(result.isRemote).toBe(false);
    expect(state.resolved.profiles["chrome-live"]).toEqual({
      driver: "existing-session",
      attachOnly: true,
      color: expect.any(String),
    });
    expect(configMocks.writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        browser: expect.objectContaining({
          profiles: expect.objectContaining({
            "chrome-live": expect.objectContaining({
              driver: "existing-session",
              attachOnly: true,
            }),
          }),
        }),
      }),
    );
  });

  it("rejects driver=existing-session when cdpUrl is provided", async () => {
    const resolved = resolveBrowserConfig({});
    const { ctx } = createCtx(resolved);
    configMocks.loadConfig.mockReturnValue({ browser: { profiles: {} } });

    const service = createBrowserProfilesService(ctx);

    await expect(
      service.createProfile({
        name: "chrome-live",
        driver: "existing-session",
        cdpUrl: "http://127.0.0.1:9222",
      }),
    ).rejects.toThrow(/does not accept cdpUrl/i);
  });

  it("creates existing-session profiles with an explicit userDataDir", async () => {
    const resolved = resolveBrowserConfig({});
    const { ctx, state } = createCtx(resolved);
    configMocks.loadConfig.mockReturnValue({ browser: { profiles: {} } });

    const tempDir = fs.mkdtempSync(path.join("/tmp", "openclaw-profile-"));
    const userDataDir = path.join(tempDir, "BraveSoftware", "Brave-Browser");
    fs.mkdirSync(userDataDir, { recursive: true });

    const service = createBrowserProfilesService(ctx);
    const result = await service.createProfile({
      name: "brave-live",
      driver: "existing-session",
      userDataDir,
    });

    expect(result.transport).toBe("chrome-mcp");
    expect(result.userDataDir).toBe(userDataDir);
    expect(state.resolved.profiles["brave-live"]).toEqual({
      driver: "existing-session",
      attachOnly: true,
      userDataDir,
      color: expect.any(String),
    });
  });

  it("rejects userDataDir for non-existing-session profiles", async () => {
    const resolved = resolveBrowserConfig({});
    const { ctx } = createCtx(resolved);
    configMocks.loadConfig.mockReturnValue({ browser: { profiles: {} } });

    const tempDir = fs.mkdtempSync(path.join("/tmp", "openclaw-profile-"));
    const userDataDir = path.join(tempDir, "BraveSoftware", "Brave-Browser");
    fs.mkdirSync(userDataDir, { recursive: true });

    const service = createBrowserProfilesService(ctx);

    await expect(
      service.createProfile({
        name: "brave-live",
        userDataDir,
      }),
    ).rejects.toThrow(/driver=existing-session is required/i);
  });

  it("deletes remote profiles without stopping or removing local data", async () => {
    const resolved = resolveBrowserConfig({
      profiles: {
        remote: { cdpUrl: "http://10.0.0.42:9222", color: "#0066CC" },
      },
    });
    const { ctx } = createCtx(resolved);

    configMocks.loadConfig.mockReturnValue({
      browser: {
        defaultProfile: "openclaw",
        profiles: {
          openclaw: { cdpPort: 18800, color: "#FF4500" },
          remote: { cdpUrl: "http://10.0.0.42:9222", color: "#0066CC" },
        },
      },
    });

    const service = createBrowserProfilesService(ctx);
    const result = await service.deleteProfile("remote");

    expect(result.deleted).toBe(false);
    expect(ctx.forProfile).not.toHaveBeenCalled();
    expect(trashMocks.movePathToTrash).not.toHaveBeenCalled();
  });

  it("deletes local profiles and moves data to Trash", async () => {
    const resolved = resolveBrowserConfig({
      profiles: {
        work: { cdpPort: 18801, color: "#0066CC" },
      },
    });
    const { ctx } = createCtx(resolved);

    configMocks.loadConfig.mockReturnValue({
      browser: {
        defaultProfile: "openclaw",
        profiles: {
          openclaw: { cdpPort: 18800, color: "#FF4500" },
          work: { cdpPort: 18801, color: "#0066CC" },
        },
      },
    });

    const tempDir = fs.mkdtempSync(path.join("/tmp", "openclaw-profile-"));
    const userDataDir = path.join(tempDir, "work", "user-data");
    fs.mkdirSync(path.dirname(userDataDir), { recursive: true });
    chromeMocks.resolveOpenClawUserDataDir.mockReturnValue(userDataDir);

    const service = createBrowserProfilesService(ctx);
    const result = await service.deleteProfile("work");

    expect(result.deleted).toBe(true);
    expect(trashMocks.movePathToTrash).toHaveBeenCalledWith(path.dirname(userDataDir));
  });

  it("deletes existing-session profiles without touching local browser data", async () => {
    const resolved = resolveBrowserConfig({
      profiles: {
        "chrome-live": {
          cdpPort: 18801,
          color: "#0066CC",
          driver: "existing-session",
          attachOnly: true,
        },
      },
    });
    const { ctx } = createCtx(resolved);

    configMocks.loadConfig.mockReturnValue({
      browser: {
        defaultProfile: "openclaw",
        profiles: {
          openclaw: { cdpPort: 18800, color: "#FF4500" },
          "chrome-live": {
            cdpPort: 18801,
            color: "#0066CC",
            driver: "existing-session",
            attachOnly: true,
          },
        },
      },
    });

    const service = createBrowserProfilesService(ctx);
    const result = await service.deleteProfile("chrome-live");

    expect(result.deleted).toBe(false);
    expect(ctx.forProfile).not.toHaveBeenCalled();
    expect(trashMocks.movePathToTrash).not.toHaveBeenCalled();
  });
});
