import { describe, expect, it } from "vitest";
import {
  classifyReleaseCompareCommandOutput,
  compareReleaseCompareResults,
  redactPersistedCommandText,
  resolveQaReleaseOutputDir,
  runQaReleaseSmoke,
  summarizeInstallClassification,
  toPersistedCompareResult,
} from "./release-compare.js";

describe("qa release compare", () => {
  it("keeps packaged-entry to validation transitions as changed", () => {
    expect(
      compareReleaseCompareResults(
        {
          id: "plugins-smoke-json",
          argv: [],
          exitCode: 1,
          timedOut: false,
          stdout: "",
          stderr: "",
          classification: "packaged_entry_missing",
          summary: "missing packaged entry",
        },
        {
          id: "plugins-smoke-json",
          argv: [],
          exitCode: 1,
          timedOut: false,
          stdout: "",
          stderr: "",
          classification: "plugin_validation_error",
          summary: "plugin validation or register/activate failure",
        },
      ),
    ).toBe("changed");
  });

  it("uses parsed plugins-smoke JSON classifications even on non-zero exit", () => {
    expect(
      classifyReleaseCompareCommandOutput(
        "plugins-smoke-json",
        JSON.stringify({ classification: "load_error" }),
        "",
        1,
        false,
      ),
    ).toBe("load_error");
  });

  it("ignores unknown parsed smoke classifications and falls back to command heuristics", () => {
    expect(
      classifyReleaseCompareCommandOutput(
        "plugins-smoke-json",
        JSON.stringify({ classification: "surprise" }),
        "",
        1,
        false,
      ),
    ).toBe("error");
  });

  it("preserves plugin validation failures even when smoke is unsupported", () => {
    expect(
      classifyReleaseCompareCommandOutput(
        "plugins-smoke-json",
        "",
        [
          "[plugins] matrix missing register/activate export",
          "[plugins] 1 plugin(s) failed to initialize (validation: matrix).",
          "error: unknown command 'smoke'",
        ].join("\n"),
        1,
        false,
      ),
    ).toBe("plugin_validation_error");
  });

  it("ignores unsupported helper commands when summarizing overall smoke health", () => {
    expect(
      summarizeInstallClassification({
        commandResults: [
          {
            id: "plugins-smoke-json",
            argv: [],
            exitCode: 1,
            timedOut: false,
            stdout: "",
            stderr: "error: unknown command 'smoke'",
            classification: "command_missing",
            summary: "command missing in this release",
          },
          {
            id: "doctor",
            argv: [],
            exitCode: 0,
            timedOut: false,
            stdout: "",
            stderr: "",
            classification: "ok",
            summary: "command succeeded",
          },
        ],
      }),
    ).toBe("ok");
  });

  it("fails the smoke gate when a command reports load errors", () => {
    expect(
      summarizeInstallClassification({
        commandResults: [
          {
            id: "plugins-smoke-json",
            argv: [],
            exitCode: 1,
            timedOut: false,
            stdout: "",
            stderr: "",
            classification: "load_error",
            summary: "plugin failed to load",
          },
        ],
      }),
    ).toBe("load_error");
  });

  it("fails the smoke gate when required commands are missing", () => {
    expect(
      summarizeInstallClassification({
        commandResults: [
          {
            id: "status",
            argv: ["status"],
            exitCode: 1,
            timedOut: false,
            stdout: "",
            stderr: "error: unknown command 'status'",
            classification: "command_missing",
            summary: "command missing in this release",
          },
        ],
      }),
    ).toBe("command_missing");
  });

  it("rejects unknown scenarios instead of running zero smoke commands", async () => {
    await expect(
      runQaReleaseSmoke({
        repoRoot: "/tmp/openclaw-repo",
        ref: "2026.4.10",
        scenarioId: "typo-scenario" as never,
      }),
    ).rejects.toThrow("Unknown QA release scenario: typo-scenario");
  });

  it("accepts repo-contained absolute output dirs after CLI normalization", () => {
    expect(
      resolveQaReleaseOutputDir({
        repoRoot: "/tmp/openclaw-repo",
        outputDir: "/tmp/openclaw-repo/.artifacts/qa/release-smoke/2026.4.10",
        fallbackParts: [".artifacts", "qa", "release-smoke", "2026.4.10"],
      }),
    ).toBe("/tmp/openclaw-repo/.artifacts/qa/release-smoke/2026.4.10");
  });

  it("redacts sensitive command output before persistence", () => {
    expect(
      redactPersistedCommandText(
        [
          "Authorization: Bearer topsecret",
          "OPENAI_API_KEY=sk-secret-token",
          "SLACK_BOT_TOKEN=xoxb-secret-token",
        ].join("\n"),
      ),
    ).toBe(
      [
        "Authorization: Bearer <REDACTED>",
        "OPENAI_API_KEY=<REDACTED>",
        "SLACK_BOT_TOKEN=<REDACTED>",
      ].join("\n"),
    );
  });

  it("omits raw stdout and stderr from persisted compare JSON", () => {
    const persisted = toPersistedCompareResult({
      outputDir: "/tmp/out",
      reportPath: "/tmp/out/report.md",
      summaryPath: "/tmp/out/summary.json",
      scenarioId: "bundled-channels",
      oldInstall: {
        label: "old",
        requestedRef: "2026.4.9",
        installRef: "openclaw@2026.4.9",
        versionText: "OpenClaw 2026.4.9",
        prefixDir: "/tmp/old-prefix",
        homeDir: "/tmp/old-home",
        binPath: "/tmp/old.mjs",
        commandResults: [
          {
            id: "doctor",
            argv: ["doctor"],
            exitCode: 1,
            timedOut: false,
            stdout: "secret-out",
            stderr: "secret-err",
            classification: "error",
            summary: "command failed",
          },
        ],
      },
      newInstall: {
        label: "new",
        requestedRef: "2026.4.10",
        installRef: "openclaw@2026.4.10",
        versionText: "OpenClaw 2026.4.10",
        prefixDir: "/tmp/new-prefix",
        homeDir: "/tmp/new-home",
        binPath: "/tmp/new.mjs",
        commandResults: [],
      },
      diff: [],
    });
    expect(persisted.oldInstall.commandResults[0]).toEqual(
      expect.objectContaining({
        id: "doctor",
        classification: "error",
        summary: "command failed",
      }),
    );
    expect(persisted.oldInstall.commandResults[0]).not.toHaveProperty("stdout");
    expect(persisted.oldInstall.commandResults[0]).not.toHaveProperty("stderr");
    expect(persisted.oldInstall).not.toHaveProperty("prefixDir");
    expect(persisted.oldInstall).not.toHaveProperty("homeDir");
    expect(persisted.oldInstall).not.toHaveProperty("binPath");
  });

  it("drops local install refs from persisted compare JSON", () => {
    const persisted = toPersistedCompareResult({
      outputDir: "/tmp/out",
      reportPath: "/tmp/out/report.md",
      summaryPath: "/tmp/out/summary.json",
      scenarioId: "bundled-channels",
      oldInstall: {
        label: "old",
        requestedRef: "./dist/openclaw-old.tgz",
        installRef: "/tmp/openclaw-old.tgz",
        versionText: "OpenClaw 2026.4.9",
        prefixDir: "/tmp/old-prefix",
        homeDir: "/tmp/old-home",
        binPath: "/tmp/old.mjs",
        commandResults: [],
      },
      newInstall: {
        label: "new",
        requestedRef: "2026.4.10",
        installRef: "openclaw@2026.4.10",
        versionText: "OpenClaw 2026.4.10",
        prefixDir: "/tmp/new-prefix",
        homeDir: "/tmp/new-home",
        binPath: "/tmp/new.mjs",
        commandResults: [],
      },
      diff: [],
    });

    expect(persisted.oldInstall.installRef).toBeUndefined();
    expect(persisted.newInstall.installRef).toBe("openclaw@2026.4.10");
  });
});
