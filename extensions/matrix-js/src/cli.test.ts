import { Command } from "commander";
import { formatZonedTimestamp } from "openclaw/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bootstrapMatrixVerificationMock = vi.fn();
const getMatrixVerificationStatusMock = vi.fn();
const verifyMatrixRecoveryKeyMock = vi.fn();

vi.mock("./matrix/actions/verification.js", () => ({
  bootstrapMatrixVerification: (...args: unknown[]) => bootstrapMatrixVerificationMock(...args),
  getMatrixVerificationStatus: (...args: unknown[]) => getMatrixVerificationStatusMock(...args),
  verifyMatrixRecoveryKey: (...args: unknown[]) => verifyMatrixRecoveryKeyMock(...args),
}));

let registerMatrixJsCli: typeof import("./cli.js").registerMatrixJsCli;

function buildProgram(): Command {
  const program = new Command();
  registerMatrixJsCli({ program });
  return program;
}

function formatExpectedLocalTimestamp(value: string): string {
  return formatZonedTimestamp(new Date(value), { displaySeconds: true }) ?? value;
}

describe("matrix-js CLI verification commands", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.exitCode = undefined;
    ({ registerMatrixJsCli } = await import("./cli.js"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("sets non-zero exit code for device verification failures in JSON mode", async () => {
    verifyMatrixRecoveryKeyMock.mockResolvedValue({
      success: false,
      error: "invalid key",
    });
    const program = buildProgram();

    await program.parseAsync(["matrix-js", "verify", "device", "bad-key", "--json"], {
      from: "user",
    });

    expect(process.exitCode).toBe(1);
  });

  it("sets non-zero exit code for bootstrap failures in JSON mode", async () => {
    bootstrapMatrixVerificationMock.mockResolvedValue({
      success: false,
      error: "bootstrap failed",
      verification: {},
      crossSigning: {},
      pendingVerifications: 0,
      cryptoBootstrap: null,
    });
    const program = buildProgram();

    await program.parseAsync(["matrix-js", "verify", "bootstrap", "--json"], { from: "user" });

    expect(process.exitCode).toBe(1);
  });

  it("keeps zero exit code for successful bootstrap in JSON mode", async () => {
    process.exitCode = 0;
    bootstrapMatrixVerificationMock.mockResolvedValue({
      success: true,
      verification: {},
      crossSigning: {},
      pendingVerifications: 0,
      cryptoBootstrap: {},
    });
    const program = buildProgram();

    await program.parseAsync(["matrix-js", "verify", "bootstrap", "--json"], { from: "user" });

    expect(process.exitCode).toBe(0);
  });

  it("prints local timezone timestamps for verify status output", async () => {
    const recoveryCreatedAt = "2026-02-25T20:10:11.000Z";
    getMatrixVerificationStatusMock.mockResolvedValue({
      verified: true,
      userId: "@bot:example.org",
      deviceId: "DEVICE123",
      backupVersion: "1",
      recoveryKeyStored: true,
      recoveryKeyCreatedAt: recoveryCreatedAt,
      pendingVerifications: 0,
    });
    const program = buildProgram();

    await program.parseAsync(["matrix-js", "verify", "status"], { from: "user" });

    expect(console.log).toHaveBeenCalledWith(
      `Recovery key created at: ${formatExpectedLocalTimestamp(recoveryCreatedAt)}`,
    );
  });

  it("prints local timezone timestamps for verify bootstrap and device output", async () => {
    const recoveryCreatedAt = "2026-02-25T20:10:11.000Z";
    const verifiedAt = "2026-02-25T20:14:00.000Z";
    bootstrapMatrixVerificationMock.mockResolvedValue({
      success: true,
      verification: {
        verified: true,
        userId: "@bot:example.org",
        deviceId: "DEVICE123",
        recoveryKeyCreatedAt: recoveryCreatedAt,
      },
      crossSigning: {
        published: true,
        masterKeyPublished: true,
        selfSigningKeyPublished: true,
        userSigningKeyPublished: true,
      },
      pendingVerifications: 0,
      cryptoBootstrap: {},
    });
    verifyMatrixRecoveryKeyMock.mockResolvedValue({
      success: true,
      userId: "@bot:example.org",
      deviceId: "DEVICE123",
      backupVersion: "1",
      recoveryKeyCreatedAt: recoveryCreatedAt,
      verifiedAt,
    });
    const program = buildProgram();

    await program.parseAsync(["matrix-js", "verify", "bootstrap"], { from: "user" });
    await program.parseAsync(["matrix-js", "verify", "device", "valid-key"], { from: "user" });

    expect(console.log).toHaveBeenCalledWith(
      `Recovery key created at: ${formatExpectedLocalTimestamp(recoveryCreatedAt)}`,
    );
    expect(console.log).toHaveBeenCalledWith(
      `Verified at: ${formatExpectedLocalTimestamp(verifiedAt)}`,
    );
  });
});
