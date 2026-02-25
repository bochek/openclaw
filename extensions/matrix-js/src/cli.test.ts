import { Command } from "commander";
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
});
