import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgram, __testing as buildProgramTesting } from "./program/build-program.js";
import {
  installBaseProgramMocks,
  registerSmokeProgramCommands,
  runTui,
  runtime,
  setupCommand,
  setupWizardCommand,
} from "./program.test-mocks.js";

installBaseProgramMocks();

describe("cli program (smoke)", () => {
  let program = createProgram();

  function createProgram() {
    return buildProgram();
  }

  async function runProgram(argv: string[]) {
    await program.parseAsync(argv, { from: "user" });
  }

  beforeEach(() => {
    buildProgramTesting.resetDepsForTest();
    buildProgramTesting.setDepsForTest({
      registerProgramCommands: (nextProgram) => {
        registerSmokeProgramCommands(nextProgram);
      },
      createProgramContext: () => ({ programVersion: "0.0.0-test" }) as never,
      configureProgramHelp: () => undefined,
      registerPreActionHooks: () => undefined,
      setProgramContext: () => undefined,
    });
    program = createProgram();
    vi.clearAllMocks();
    runTui.mockResolvedValue(undefined);
  });

  it("registers message + status commands", () => {
    const names = program.commands.map((command) => command.name());
    expect(names).toContain("message");
    expect(names).toContain("status");
  });

  it("runs tui with explicit timeout override", async () => {
    await runProgram(["tui", "--timeout-ms", "45000"]);
    expect(runTui).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 45000 }));
  });

  it("warns and ignores invalid tui timeout override", async () => {
    await runProgram(["tui", "--timeout-ms", "nope"]);
    expect(runtime.error).toHaveBeenCalledWith('warning: invalid --timeout-ms "nope"; ignoring');
    expect(runTui).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: undefined }));
  });

  it("runs setup wizard when wizard flags are present", async () => {
    await runProgram(["setup", "--remote-url", "ws://example"]);

    expect(setupCommand).not.toHaveBeenCalled();
    expect(setupWizardCommand).toHaveBeenCalledTimes(1);
  });
});
