import { Command } from "commander";
import { registerProgramCommands } from "./command-registry.js";
import { createProgramContext } from "./context.js";
import { configureProgramHelp } from "./help.js";
import { registerPreActionHooks } from "./preaction.js";
import { setProgramContext } from "./program-context.js";

type BuildProgramDeps = {
  registerProgramCommands: typeof registerProgramCommands;
  createProgramContext: typeof createProgramContext;
  configureProgramHelp: typeof configureProgramHelp;
  registerPreActionHooks: typeof registerPreActionHooks;
  setProgramContext: typeof setProgramContext;
};

const defaultBuildProgramDeps: BuildProgramDeps = {
  registerProgramCommands,
  createProgramContext,
  configureProgramHelp,
  registerPreActionHooks,
  setProgramContext,
};

let buildProgramDeps: BuildProgramDeps = { ...defaultBuildProgramDeps };

export function buildProgram() {
  const program = new Command();
  program.enablePositionalOptions();
  const ctx = buildProgramDeps.createProgramContext();
  const argv = process.argv;

  buildProgramDeps.setProgramContext(program, ctx);
  buildProgramDeps.configureProgramHelp(program, ctx);
  buildProgramDeps.registerPreActionHooks(program, ctx.programVersion);

  buildProgramDeps.registerProgramCommands(program, ctx, argv);

  return program;
}

export const __testing = {
  setDepsForTest(overrides: Partial<BuildProgramDeps>) {
    buildProgramDeps = { ...buildProgramDeps, ...overrides };
  },
  resetDepsForTest() {
    buildProgramDeps = { ...defaultBuildProgramDeps };
  },
};
