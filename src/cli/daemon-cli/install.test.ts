import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAutoNodeExtraCaCertsMock = vi.hoisted(() => vi.fn());
const loadConfigMock = vi.hoisted(() => vi.fn(() => ({ gateway: { auth: { mode: "token" } } })));
const readConfigFileSnapshotMock = vi.hoisted(() =>
  vi.fn(async () => ({ exists: false, valid: true, config: {} })),
);
const resolveGatewayPortMock = vi.hoisted(() => vi.fn(() => 18789));
const writeConfigFileMock = vi.hoisted(() => vi.fn());
const resolveIsNixModeMock = vi.hoisted(() => vi.fn(() => false));
const resolveGatewayAuthMock = vi.hoisted(() =>
  vi.fn(() => ({ mode: "token", token: undefined, password: undefined, allowTailscale: false })),
);
const randomTokenMock = vi.hoisted(() => vi.fn(() => "generated-token"));
const buildGatewayInstallPlanMock = vi.hoisted(() =>
  vi.fn(async () => ({
    programArguments: ["openclaw", "gateway", "run"],
    workingDirectory: "/tmp",
    environment: {},
  })),
);
const parsePortMock = vi.hoisted(() => vi.fn(() => null));
const isGatewayDaemonRuntimeMock = vi.hoisted(() => vi.fn(() => true));
const emitDaemonActionJsonMock = vi.hoisted(() => vi.fn());

const service = vi.hoisted(() => ({
  label: "systemd",
  loadedText: "enabled",
  notLoadedText: "disabled",
  isLoaded: vi.fn(async () => false),
  install: vi.fn(async () => {}),
  uninstall: vi.fn(async () => {}),
  restart: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  readCommand: vi.fn(async () => null),
  readRuntime: vi.fn(async () => ({ status: "stopped" as const })),
}));

vi.mock("../../bootstrap/node-extra-ca-certs.js", () => ({
  resolveAutoNodeExtraCaCerts: resolveAutoNodeExtraCaCertsMock,
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: loadConfigMock,
  readConfigFileSnapshot: readConfigFileSnapshotMock,
  resolveGatewayPort: resolveGatewayPortMock,
  writeConfigFile: writeConfigFileMock,
}));

vi.mock("../../config/paths.js", () => ({
  resolveIsNixMode: resolveIsNixModeMock,
}));

vi.mock("../../gateway/auth.js", () => ({
  resolveGatewayAuth: resolveGatewayAuthMock,
}));

vi.mock("../../commands/onboard-helpers.js", () => ({
  randomToken: randomTokenMock,
}));

vi.mock("../../commands/daemon-install-helpers.js", () => ({
  buildGatewayInstallPlan: buildGatewayInstallPlanMock,
}));

vi.mock("./shared.js", () => ({
  parsePort: parsePortMock,
}));

vi.mock("../../commands/daemon-runtime.js", () => ({
  DEFAULT_GATEWAY_DAEMON_RUNTIME: "node",
  isGatewayDaemonRuntime: isGatewayDaemonRuntimeMock,
}));

vi.mock("../../daemon/service.js", () => ({
  resolveGatewayService: () => service,
}));

vi.mock("./response.js", () => ({
  buildDaemonServiceSnapshot: vi.fn(() => ({ label: "systemd", loaded: true })),
  createNullWriter: () => process.stdout,
  emitDaemonActionJson: emitDaemonActionJsonMock,
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  },
}));

const { runDaemonInstall } = await import("./install.js");

describe("runDaemonInstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadConfigMock.mockReturnValue({ gateway: { auth: { mode: "token" } } });
    readConfigFileSnapshotMock.mockResolvedValue({ exists: false, valid: true, config: {} });
    resolveGatewayPortMock.mockReturnValue(18789);
    resolveIsNixModeMock.mockReturnValue(false);
    resolveGatewayAuthMock.mockReturnValue({
      mode: "token",
      token: undefined,
      password: undefined,
      allowTailscale: false,
    });
    randomTokenMock.mockReturnValue("generated-token");
    buildGatewayInstallPlanMock.mockResolvedValue({
      programArguments: ["openclaw", "gateway", "run"],
      workingDirectory: "/tmp",
      environment: {},
    });
    parsePortMock.mockReturnValue(null);
    isGatewayDaemonRuntimeMock.mockReturnValue(true);
    service.isLoaded.mockResolvedValue(false);
    service.readCommand.mockResolvedValue(null);
    resolveAutoNodeExtraCaCertsMock.mockReturnValue(undefined);
  });

  it("returns already-installed when the service already has the expected TLS env", async () => {
    service.isLoaded.mockResolvedValue(true);
    resolveAutoNodeExtraCaCertsMock.mockReturnValue("/etc/ssl/certs/ca-certificates.crt");
    service.readCommand.mockResolvedValue({
      programArguments: ["openclaw", "gateway", "run"],
      environment: {
        NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/ca-certificates.crt",
      },
    });

    await runDaemonInstall({ json: true });

    expect(service.install).not.toHaveBeenCalled();
    expect(emitDaemonActionJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ result: "already-installed" }),
    );
  });

  it("reinstalls when an existing service is missing the nvm TLS CA bundle", async () => {
    service.isLoaded.mockResolvedValue(true);
    resolveAutoNodeExtraCaCertsMock.mockReturnValue("/etc/ssl/certs/ca-certificates.crt");
    service.readCommand.mockResolvedValue({
      programArguments: ["openclaw", "gateway", "run"],
      environment: {},
    });

    await runDaemonInstall({ json: true });

    expect(service.install).toHaveBeenCalledTimes(1);
    expect(emitDaemonActionJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ result: "installed" }),
    );
  });
});
