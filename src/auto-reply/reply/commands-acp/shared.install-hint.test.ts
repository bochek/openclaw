import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import { resolveAcpInstallCommandHint } from "./shared.js";

describe("resolveAcpInstallCommandHint", () => {
  const originalCwd = process.cwd();
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-acp-install-hint-"));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns configured install command override", () => {
    const cfg = {
      acp: {
        runtime: {
          installCommand: "custom install command",
        },
      },
    } as OpenClawConfig;
    expect(resolveAcpInstallCommandHint(cfg)).toBe("custom install command");
  });

  it("uses publishable acpx npm package when local extension path is absent", () => {
    process.chdir(tempDir);
    const cfg = {} as OpenClawConfig;
    expect(resolveAcpInstallCommandHint(cfg)).toBe("openclaw plugins install acpx");
  });

  it("returns generic backend message for non-acpx backends", () => {
    const cfg = {
      acp: {
        backend: "custom-backend",
      },
    } as OpenClawConfig;
    expect(resolveAcpInstallCommandHint(cfg)).toContain('backend "custom-backend"');
  });
});
