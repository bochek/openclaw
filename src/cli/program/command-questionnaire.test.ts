import { Command, Option } from "commander";
import { describe, expect, it } from "vitest";
import {
  buildOptionalParameterEntries,
  isRequiredOption,
  preferredOptionFlag,
  shouldPromptForOption,
  splitMultiValueInput,
} from "./command-questionnaire.js";

describe("command-questionnaire", () => {
  it("splits multi-value input by spaces and commas", () => {
    expect(splitMultiValueInput("a b, c,,d")).toEqual(["a", "b", "c", "d"]);
  });

  it("prefers long option flags", () => {
    const option = new Option("-p, --provider <name>");
    expect(preferredOptionFlag(option)).toBe("--provider");
  });

  it("falls back to short flag when long is absent", () => {
    const option = new Option("-f");
    expect(preferredOptionFlag(option)).toBe("-f");
  });

  it("skips internal and hidden options", () => {
    expect(shouldPromptForOption(new Option("-h, --help"))).toBe(false);
    expect(shouldPromptForOption(new Option("-V, --version"))).toBe(false);
    expect(shouldPromptForOption(new Option("-i, --interactive"))).toBe(false);

    const hidden = new Option("--secret");
    hidden.hideHelp(true);
    expect(shouldPromptForOption(hidden)).toBe(false);
  });

  it("prompts for regular options", () => {
    expect(shouldPromptForOption(new Option("--provider <name>"))).toBe(true);
  });

  it("detects required options", () => {
    const required = new Option("--provider <name>").makeOptionMandatory(true);
    const optional = new Option("--verbose");

    expect(isRequiredOption(required)).toBe(true);
    expect(isRequiredOption(optional)).toBe(false);
  });

  it("builds optional parameter entries from optional options and arguments", () => {
    const command = new Command("demo")
      .argument("<target>")
      .argument("[note]")
      .addOption(new Option("--provider <name>").makeOptionMandatory(true))
      .option("--verbose", "Verbose output");

    const entries = buildOptionalParameterEntries(command);

    expect(entries.map((entry) => entry.label)).toContain("--verbose");
    expect(entries.map((entry) => entry.label)).toContain("[note]");
    expect(entries.map((entry) => entry.label)).not.toContain("--provider");
    expect(entries.map((entry) => entry.label)).not.toContain("<target>");
  });
});
