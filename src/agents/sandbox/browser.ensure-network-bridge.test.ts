import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxConfig } from "./types.js";

const {
  buildSandboxCreateArgs,
  dockerContainerState,
  execDocker,
  readDockerPort,
  readDockerNetworkMode,
} = vi.hoisted(() => ({
  buildSandboxCreateArgs: vi.fn(),
  dockerContainerState: vi.fn(),
  execDocker: vi.fn(),
  readDockerPort: vi.fn(),
  readDockerNetworkMode: vi.fn(),
}));

const { startBrowserBridgeServer } = vi.hoisted(() => ({
  startBrowserBridgeServer: vi.fn(),
}));

const { updateBrowserRegistry } = vi.hoisted(() => ({
  updateBrowserRegistry: vi.fn(),
}));

vi.mock("./docker.js", () => ({
  buildSandboxCreateArgs,
  dockerContainerState,
  execDocker,
  readDockerPort,
  readDockerNetworkMode,
}));

vi.mock("../../browser/bridge-server.js", () => ({
  startBrowserBridgeServer,
  stopBrowserBridgeServer: vi.fn(async () => undefined),
}));

vi.mock("./registry.js", () => ({
  updateBrowserRegistry,
}));

vi.mock("./tool-policy.js", () => ({
  isToolAllowed: vi.fn(() => true),
}));

import { BROWSER_BRIDGES } from "./browser-bridges.js";
import { ensureSandboxBrowser } from "./browser.js";

function makeConfig(): SandboxConfig {
  return {
    mode: "all",
    scope: "shared",
    workspaceAccess: "rw",
    workspaceRoot: "/tmp",
    docker: {
      image: "sandbox-image",
      containerPrefix: "sandbox-",
      workdir: "/workspace",
      readOnlyRoot: true,
      tmpfs: ["/tmp"],
      network: "none",
      capDrop: ["ALL"],
      env: { LANG: "C.UTF-8" },
    },
    browser: {
      enabled: true,
      image: "browser-image",
      containerPrefix: "openclaw-browser-",
      cdpPort: 9222,
      vncPort: 5900,
      noVncPort: 6080,
      headless: true,
      enableNoVnc: false,
      allowHostControl: false,
      autoStart: true,
      autoStartTimeoutMs: 1000,
    },
    tools: { allow: ["*"], deny: [] },
    prune: { idleHours: 24, maxAgeDays: 7 },
  };
}

describe("ensureSandboxBrowser network mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    BROWSER_BRIDGES.clear();
    buildSandboxCreateArgs.mockReturnValue(["create", "--name", "openclaw-browser-shared"]);
    execDocker.mockResolvedValue({ stdout: "", stderr: "", code: 0 });
    readDockerPort.mockResolvedValue(41234);
    startBrowserBridgeServer.mockResolvedValue({
      baseUrl: "http://127.0.0.1:3000",
      server: {},
      state: { resolved: { profiles: {} } },
    });
    updateBrowserRegistry.mockResolvedValue(undefined);
  });

  it("recreates existing browser container when network is not bridge", async () => {
    dockerContainerState.mockResolvedValue({ exists: true, running: true });
    readDockerNetworkMode.mockResolvedValue("none");

    await ensureSandboxBrowser({
      scopeKey: "session-1",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/workspace",
      cfg: makeConfig(),
    });

    expect(buildSandboxCreateArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg: expect.objectContaining({ network: "bridge" }),
      }),
    );
    expect(execDocker).toHaveBeenCalledWith(["stop", "openclaw-browser-shared"]);
    expect(execDocker).toHaveBeenCalledWith(["rm", "openclaw-browser-shared"]);
    expect(execDocker).toHaveBeenCalledWith(["start", "openclaw-browser-shared"]);
  });

  it("keeps existing bridge container and only starts when stopped", async () => {
    dockerContainerState.mockResolvedValue({ exists: true, running: false });
    readDockerNetworkMode.mockResolvedValue("bridge");

    await ensureSandboxBrowser({
      scopeKey: "session-1",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/workspace",
      cfg: makeConfig(),
    });

    expect(buildSandboxCreateArgs).not.toHaveBeenCalled();
    expect(execDocker).not.toHaveBeenCalledWith(["rm", "openclaw-browser-shared"]);
    expect(execDocker).toHaveBeenCalledWith(["start", "openclaw-browser-shared"]);
  });
});
