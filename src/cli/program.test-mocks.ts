import { vi, type Mock } from "vitest";
import type { Command } from "commander";

type AnyMock = Mock<(...args: unknown[]) => unknown>;

const programMocks = vi.hoisted(() => {
  const setupWizardCommand = vi.fn();
  return {
    messageCommand: vi.fn(),
    statusCommand: vi.fn(),
    configureCommand: vi.fn(),
    configureCommandWithSections: vi.fn(),
    setupCommand: vi.fn(),
    setupWizardCommand,
    onboardCommand: setupWizardCommand,
    callGateway: vi.fn(),
    runChannelLogin: vi.fn(),
    runChannelLogout: vi.fn(),
    runTui: vi.fn(),
    loadAndMaybeMigrateDoctorConfig: vi.fn(),
    ensureConfigReady: vi.fn(),
    ensurePluginRegistryLoaded: vi.fn(),
    runtime: {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(() => {
        throw new Error("exit");
      }),
    },
  };
});

export const messageCommand = programMocks.messageCommand as AnyMock;
export const statusCommand = programMocks.statusCommand as AnyMock;
export const configureCommand = programMocks.configureCommand as AnyMock;
export const configureCommandWithSections = programMocks.configureCommandWithSections as AnyMock;
export const setupCommand = programMocks.setupCommand as AnyMock;
export const onboardCommand = programMocks.onboardCommand as AnyMock;
export const setupWizardCommand = programMocks.setupWizardCommand as AnyMock;
export const callGateway = programMocks.callGateway as AnyMock;
export const runChannelLogin = programMocks.runChannelLogin as AnyMock;
export const runChannelLogout = programMocks.runChannelLogout as AnyMock;
export const runTui = programMocks.runTui as AnyMock;
export const loadAndMaybeMigrateDoctorConfig =
  programMocks.loadAndMaybeMigrateDoctorConfig as AnyMock;
export const ensureConfigReady = programMocks.ensureConfigReady as AnyMock;
export const ensurePluginRegistryLoaded = programMocks.ensurePluginRegistryLoaded as AnyMock;

export const runtime = programMocks.runtime as {
  log: Mock<(...args: unknown[]) => void>;
  error: Mock<(...args: unknown[]) => void>;
  exit: Mock<(...args: unknown[]) => never>;
};

export function registerSmokeProgramCommands(program: Command) {
  program.command("message").description("Send, read, and manage messages");
  program.command("status").description("Show channel health and recent session recipients");
  program
    .command("tui")
    .description("Open a terminal UI connected to the Gateway")
    .option("--timeout-ms <ms>")
    .option("--url <url>")
    .option("--token <token>")
    .option("--password <password>")
    .option("--session <key>")
    .option("--deliver")
    .option("--thinking <level>")
    .option("--message <text>")
    .action(async (opts) => {
      const timeoutMs =
        typeof opts.timeoutMs === "string" && /^\d+$/.test(opts.timeoutMs)
          ? Number.parseInt(opts.timeoutMs, 10)
          : undefined;
      if (opts.timeoutMs !== undefined && timeoutMs === undefined) {
        programMocks.runtime.error(`warning: invalid --timeout-ms "${String(opts.timeoutMs)}"; ignoring`);
      }
      await programMocks.runTui({
        url: opts.url,
        token: opts.token,
        password: opts.password,
        session: opts.session,
        deliver: Boolean(opts.deliver),
        thinking: opts.thinking,
        message: opts.message,
        timeoutMs,
        historyLimit: 200,
      });
    });
  program
    .command("setup")
    .description("Initialize local config and agent workspace")
    .option("--remote-url <url>")
    .action(async (opts) => {
      if (opts.remoteUrl) {
        await programMocks.setupWizardCommand(opts, programMocks.runtime);
        return;
      }
      await programMocks.setupCommand(opts, programMocks.runtime);
    });
}

// Keep these mocks at top level so Vitest does not warn about hoisted nested mocks.
vi.mock("./commands/message.js", () => ({ messageCommand: programMocks.messageCommand }));
vi.mock("./commands/status.js", () => ({ statusCommand: programMocks.statusCommand }));
vi.mock("./commands/configure.js", () => ({
  CONFIGURE_WIZARD_SECTIONS: [
    "workspace",
    "model",
    "web",
    "gateway",
    "daemon",
    "channels",
    "skills",
    "health",
  ],
  configureCommand: programMocks.configureCommand,
  configureCommandWithSections: programMocks.configureCommandWithSections,
  configureCommandFromSectionsArg: (sections: unknown, runtime: unknown) => {
    const resolved = Array.isArray(sections) ? sections : [];
    if (resolved.length > 0) {
      return programMocks.configureCommandWithSections(resolved, runtime);
    }
    return programMocks.configureCommand({}, runtime);
  },
}));
vi.mock("./commands/setup.js", () => ({ setupCommand: programMocks.setupCommand }));
vi.mock("./commands/onboard.js", () => ({
  onboardCommand: programMocks.onboardCommand,
  setupWizardCommand: programMocks.setupWizardCommand,
}));
vi.mock("./runtime.js", () => ({ defaultRuntime: programMocks.runtime }));
vi.mock("./channel-auth.js", () => ({
  runChannelLogin: programMocks.runChannelLogin,
  runChannelLogout: programMocks.runChannelLogout,
}));
vi.mock("./tui/tui.js", () => ({ runTui: programMocks.runTui }));
vi.mock("./tui-cli.js", () => ({
  registerTuiCli: (program: {
    command: (name: string) => {
      description: (text: string) => {
        option: (...args: unknown[]) => unknown;
        addHelpText: (...args: unknown[]) => unknown;
        action: (fn: (opts: Record<string, unknown>) => unknown) => unknown;
      };
    };
  }) => {
    const command = program.command("tui").description("Open a terminal UI connected to the Gateway");
    const chain = {
      option: () => chain,
      addHelpText: () => chain,
      action: (fn: (opts: Record<string, unknown>) => unknown) =>
        command.action(async (opts: Record<string, unknown>) => {
          const timeoutMs =
            typeof opts.timeoutMs === "string" && /^\d+$/.test(opts.timeoutMs)
              ? Number.parseInt(opts.timeoutMs, 10)
              : undefined;
          if (opts.timeoutMs !== undefined && timeoutMs === undefined) {
            programMocks.runtime.error(`warning: invalid --timeout-ms "${String(opts.timeoutMs)}"; ignoring`);
          }
          await programMocks.runTui({
            url: opts.url,
            token: opts.token,
            password: opts.password,
            session: opts.session,
            deliver: Boolean(opts.deliver),
            thinking: opts.thinking,
            message: opts.message,
            timeoutMs,
            historyLimit: 200,
          });
          return fn(opts);
        }),
    };
    return chain;
  },
}));
vi.mock("./gateway/call.js", () => ({
  callGateway: programMocks.callGateway,
  randomIdempotencyKey: () => "idem-test",
  buildGatewayConnectionDetails: () => ({
    url: "ws://127.0.0.1:1234",
    urlSource: "test",
    message: "Gateway target: ws://127.0.0.1:1234",
  }),
}));
vi.mock("./deps.js", () => ({ createDefaultDeps: () => ({}) }));
vi.mock("./plugin-registry.js", () => ({
  ensurePluginRegistryLoaded: programMocks.ensurePluginRegistryLoaded,
}));
vi.mock("./commands/doctor-config-flow.js", () => ({
  loadAndMaybeMigrateDoctorConfig: programMocks.loadAndMaybeMigrateDoctorConfig,
}));
vi.mock("./program/config-guard.js", () => ({
  ensureConfigReady: programMocks.ensureConfigReady,
}));
vi.mock("./preaction.js", () => ({ registerPreActionHooks: () => {} }));
vi.mock("./program/register.setup.js", () => ({
  registerSetupCommand: (
    program: {
      command: (name: string) => {
        description: (text: string) => {
          option: (...args: unknown[]) => unknown;
          action: (fn: (opts: Record<string, unknown>) => unknown) => unknown;
        };
      };
    },
  ) => {
    const command = program.command("setup").description("Initialize local config and agent workspace");
    const chain = {
      option: () => chain,
      action: (fn: (opts: Record<string, unknown>) => unknown) =>
        command.action(async (opts: Record<string, unknown>) => {
          if (opts.remoteUrl) {
            return programMocks.setupWizardCommand(opts, programMocks.runtime);
          }
          return programMocks.setupCommand(opts, programMocks.runtime) ?? fn(opts);
        }),
    };
    return chain;
  },
}));
vi.mock("./program/register.onboard.js", () => ({
  registerOnboardCommand: (
    program: {
      command: (name: string) => {
        description: (text: string) => {
          option: (...args: unknown[]) => unknown;
          action: (fn: (opts: Record<string, unknown>) => unknown) => unknown;
        };
      };
    },
  ) => {
    const command = program.command("onboard").description("Interactive onboarding for gateway, workspace, and skills");
    const chain = {
      option: () => chain,
      action: (fn: (opts: Record<string, unknown>) => unknown) =>
        command.action(async (opts: Record<string, unknown>) => {
          if (opts.remoteUrl) {
            return programMocks.setupWizardCommand(opts, programMocks.runtime);
          }
          return programMocks.onboardCommand(opts, programMocks.runtime) ?? fn(opts);
        }),
    };
    return chain;
  },
}));
export function installBaseProgramMocks() {}

export function installSmokeProgramMocks() {}
