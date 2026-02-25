import type { Command } from "commander";
import {
  bootstrapMatrixVerification,
  getMatrixVerificationStatus,
  verifyMatrixRecoveryKey,
} from "./matrix/actions/verification.js";

let matrixJsCliExitScheduled = false;

function scheduleMatrixJsCliExit(): void {
  if (matrixJsCliExitScheduled || process.env.VITEST) {
    return;
  }
  matrixJsCliExitScheduled = true;
  // matrix-js-sdk rust crypto can leave background async work alive after command completion.
  setTimeout(() => {
    process.exit(process.exitCode ?? 0);
  }, 0);
}

function markCliFailure(): void {
  process.exitCode = 1;
}

function printVerificationStatus(status: {
  verified: boolean;
  userId: string | null;
  deviceId: string | null;
  backupVersion: string | null;
  recoveryKeyStored: boolean;
  recoveryKeyCreatedAt: string | null;
  pendingVerifications: number;
}): void {
  if (status.verified) {
    console.log("Verified: yes");
    console.log(`User: ${status.userId ?? "unknown"}`);
    console.log(`Device: ${status.deviceId ?? "unknown"}`);
    if (status.backupVersion) {
      console.log(`Backup version: ${status.backupVersion}`);
    }
  } else {
    console.log("Verified: no");
    console.log(`User: ${status.userId ?? "unknown"}`);
    console.log(`Device: ${status.deviceId ?? "unknown"}`);
    console.log("Run 'openclaw matrix-js verify device <key>' to verify this device.");
  }
  console.log(`Recovery key stored: ${status.recoveryKeyStored ? "yes" : "no"}`);
  if (status.recoveryKeyCreatedAt) {
    console.log(`Recovery key created at: ${status.recoveryKeyCreatedAt}`);
  }
  console.log(`Pending verifications: ${status.pendingVerifications}`);
}

export function registerMatrixJsCli(params: { program: Command }): void {
  const root = params.program
    .command("matrix-js")
    .description("Matrix-js channel utilities")
    .addHelpText("after", () => "\nDocs: https://docs.openclaw.ai/channels/matrix-js\n");

  const verify = root.command("verify").description("Device verification for Matrix E2EE");

  verify
    .command("status")
    .description("Check Matrix-js device verification status")
    .option("--account <id>", "Account ID (for multi-account setups)")
    .option("--include-recovery-key", "Include stored recovery key in output")
    .option("--json", "Output as JSON")
    .action(async (options: { account?: string; includeRecoveryKey?: boolean; json?: boolean }) => {
      try {
        const status = await getMatrixVerificationStatus({
          accountId: options.account,
          includeRecoveryKey: options.includeRecoveryKey === true,
        });
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }
        printVerificationStatus(status);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (options.json) {
          console.log(JSON.stringify({ error: message }, null, 2));
        } else {
          console.error(`Error: ${message}`);
        }
        markCliFailure();
      } finally {
        scheduleMatrixJsCliExit();
      }
    });

  verify
    .command("bootstrap")
    .description("Bootstrap Matrix-js cross-signing and device verification state")
    .option("--account <id>", "Account ID (for multi-account setups)")
    .option("--recovery-key <key>", "Recovery key to apply before bootstrap")
    .option("--force-reset-cross-signing", "Force reset cross-signing identity before bootstrap")
    .option("--json", "Output as JSON")
    .action(
      async (options: {
        account?: string;
        recoveryKey?: string;
        forceResetCrossSigning?: boolean;
        json?: boolean;
      }) => {
        try {
          const result = await bootstrapMatrixVerification({
            accountId: options.account,
            recoveryKey: options.recoveryKey,
            forceResetCrossSigning: options.forceResetCrossSigning === true,
          });
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            if (!result.success) {
              markCliFailure();
            }
            return;
          }
          console.log(`Bootstrap success: ${result.success ? "yes" : "no"}`);
          if (result.error) {
            console.log(`Error: ${result.error}`);
          }
          console.log(`Verified: ${result.verification.verified ? "yes" : "no"}`);
          console.log(`User: ${result.verification.userId ?? "unknown"}`);
          console.log(`Device: ${result.verification.deviceId ?? "unknown"}`);
          console.log(
            `Cross-signing published: ${result.crossSigning.published ? "yes" : "no"} (master=${result.crossSigning.masterKeyPublished ? "yes" : "no"}, self=${result.crossSigning.selfSigningKeyPublished ? "yes" : "no"}, user=${result.crossSigning.userSigningKeyPublished ? "yes" : "no"})`,
          );
          console.log(`Pending verifications: ${result.pendingVerifications}`);
          if (!result.success) {
            markCliFailure();
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (options.json) {
            console.log(JSON.stringify({ success: false, error: message }, null, 2));
          } else {
            console.error(`Verification bootstrap failed: ${message}`);
          }
          markCliFailure();
        } finally {
          scheduleMatrixJsCliExit();
        }
      },
    );

  verify
    .command("device <key>")
    .description("Verify device using a Matrix recovery key")
    .option("--account <id>", "Account ID (for multi-account setups)")
    .option("--json", "Output as JSON")
    .action(async (key: string, options: { account?: string; json?: boolean }) => {
      try {
        const result = await verifyMatrixRecoveryKey(key, { accountId: options.account });
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          if (!result.success) {
            markCliFailure();
          }
        } else if (result.success) {
          console.log("Device verification completed successfully.");
          console.log(`User: ${result.userId ?? "unknown"}`);
          console.log(`Device: ${result.deviceId ?? "unknown"}`);
          if (result.backupVersion) {
            console.log(`Backup version: ${result.backupVersion}`);
          }
        } else {
          console.error(`Verification failed: ${result.error ?? "unknown error"}`);
          markCliFailure();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: message }, null, 2));
        } else {
          console.error(`Verification failed: ${message}`);
        }
        markCliFailure();
      } finally {
        scheduleMatrixJsCliExit();
      }
    });
}
