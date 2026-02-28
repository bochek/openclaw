import { describe, expect, it } from "vitest";
import {
  rewriteUpdateFlagArgv,
  shouldEnsureCliPath,
  shouldRegisterPrimarySubcommand,
  shouldSkipPluginCommandRegistration,
  shouldTryRouteFirst,
} from "./run-main.js";

describe("rewriteUpdateFlagArgv", () => {
  it("leaves argv unchanged when --update is absent", () => {
    const argv = ["node", "entry.js", "status"];
    expect(rewriteUpdateFlagArgv(argv)).toBe(argv);
  });

  it("rewrites --update into the update command", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--update"])).toEqual([
      "node",
      "entry.js",
      "update",
    ]);
  });

  it("preserves global flags that appear before --update", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--profile", "p", "--update"])).toEqual([
      "node",
      "entry.js",
      "--profile",
      "p",
      "update",
    ]);
  });

  it("keeps update options after the rewritten command", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--update", "--json"])).toEqual([
      "node",
      "entry.js",
      "update",
      "--json",
    ]);
  });
});

describe("shouldRegisterPrimarySubcommand", () => {
  it("skips eager primary registration for help/version invocations", () => {
    expect(shouldRegisterPrimarySubcommand(["node", "openclaw", "status", "--help"])).toBe(false);
    expect(shouldRegisterPrimarySubcommand(["node", "openclaw", "-V"])).toBe(false);
    expect(shouldRegisterPrimarySubcommand(["node", "openclaw", "-v"])).toBe(false);
  });

  it("keeps eager primary registration for regular command runs", () => {
    expect(shouldRegisterPrimarySubcommand(["node", "openclaw", "status"])).toBe(true);
    expect(shouldRegisterPrimarySubcommand(["node", "openclaw", "acp", "-v"])).toBe(true);
  });
});

describe("shouldSkipPluginCommandRegistration", () => {
  it("skips plugin registration when no primary command is present", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "openclaw", "--help"],
        primary: null,
        hasBuiltinPrimary: false,
      }),
    ).toBe(true);
  });

  it("skips plugin registration for builtin subcommand help", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "openclaw", "config", "--help"],
        primary: "config",
        hasBuiltinPrimary: true,
      }),
    ).toBe(true);
  });

  it("skips plugin registration for builtin command runs", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "openclaw", "sessions", "--json"],
        primary: "sessions",
        hasBuiltinPrimary: true,
      }),
    ).toBe(true);
  });

  it("skips plugin registration for non-builtin help by default", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "openclaw", "voicecall", "--help"],
        primary: "voicecall",
        hasBuiltinPrimary: false,
      }),
    ).toBe(true);
  });

  it("skips plugin registration for non-builtin command runs by default", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "openclaw", "voicecall", "status"],
        primary: "voicecall",
        hasBuiltinPrimary: false,
      }),
    ).toBe(true);
  });

  it("skips plugin registration for unknown commands", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "openclaw", "definitely-not-a-command"],
        primary: "definitely-not-a-command",
        hasBuiltinPrimary: false,
      }),
    ).toBe(true);
  });

  it("can force plugin registration via env guard", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "openclaw", "unknown-cmd"],
        primary: "unknown-cmd",
        hasBuiltinPrimary: false,
        forcePluginRegistration: true,
      }),
    ).toBe(false);
  });
});

describe("shouldEnsureCliPath", () => {
  it("skips path bootstrap for help/version invocations", () => {
    expect(shouldEnsureCliPath(["node", "openclaw", "--help"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "openclaw", "-V"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "openclaw", "-v"])).toBe(false);
  });

  it("skips path bootstrap for read-only fast paths", () => {
    expect(shouldEnsureCliPath(["node", "openclaw", "status"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "openclaw", "sessions", "--json"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "openclaw", "config", "get", "update"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "openclaw", "models", "status", "--json"])).toBe(false);
  });

  it("keeps path bootstrap for mutating or unknown commands", () => {
    expect(shouldEnsureCliPath(["node", "openclaw", "message", "send"])).toBe(true);
    expect(shouldEnsureCliPath(["node", "openclaw", "voicecall", "status"])).toBe(true);
    expect(shouldEnsureCliPath(["node", "openclaw", "acp", "-v"])).toBe(true);
  });
});

describe("shouldTryRouteFirst", () => {
  it("enables route-first only for routed commands", () => {
    expect(shouldTryRouteFirst(["node", "openclaw", "status"])).toBe(true);
    expect(shouldTryRouteFirst(["node", "openclaw", "health"])).toBe(true);
    expect(shouldTryRouteFirst(["node", "openclaw", "sessions"])).toBe(true);
    expect(shouldTryRouteFirst(["node", "openclaw", "models", "status"])).toBe(false);
    expect(shouldTryRouteFirst(["node", "openclaw", "definitely-not-a-command"])).toBe(false);
    expect(shouldTryRouteFirst(["node", "openclaw"])).toBe(false);
  });
});
