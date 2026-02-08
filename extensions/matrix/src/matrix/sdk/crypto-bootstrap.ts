import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/CryptoEvent.js";
import type { MatrixDecryptBridge } from "./decrypt-bridge.js";
import type { MatrixRecoveryKeyStore } from "./recovery-key-store.js";
import type { MatrixCryptoBootstrapApi, MatrixRawEvent } from "./types.js";
import type {
  MatrixVerificationManager,
  MatrixVerificationRequestLike,
} from "./verification-manager.js";
import { LogService } from "./logger.js";

export type MatrixCryptoBootstrapperDeps<TRawEvent extends MatrixRawEvent> = {
  getUserId: () => Promise<string>;
  getDeviceId: () => string | null | undefined;
  verificationManager: MatrixVerificationManager;
  recoveryKeyStore: MatrixRecoveryKeyStore;
  decryptBridge: Pick<MatrixDecryptBridge<TRawEvent>, "bindCryptoRetrySignals">;
};

export class MatrixCryptoBootstrapper<TRawEvent extends MatrixRawEvent> {
  constructor(private readonly deps: MatrixCryptoBootstrapperDeps<TRawEvent>) {}

  async bootstrap(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    await this.bootstrapCrossSigning(crypto);
    await this.bootstrapSecretStorage(crypto);
    await this.ensureOwnDeviceTrust(crypto);
    this.registerVerificationRequestHandler(crypto);
  }

  private async bootstrapCrossSigning(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    try {
      await crypto.bootstrapCrossSigning({ setupNewCrossSigning: true });
      LogService.info("MatrixClientLite", "Cross-signing bootstrap complete");
    } catch (err) {
      LogService.warn("MatrixClientLite", "Failed to bootstrap cross-signing:", err);
    }
  }

  private async bootstrapSecretStorage(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    try {
      await this.deps.recoveryKeyStore.bootstrapSecretStorageWithRecoveryKey(crypto);
      LogService.info("MatrixClientLite", "Secret storage bootstrap complete");
    } catch (err) {
      LogService.warn("MatrixClientLite", "Failed to bootstrap secret storage:", err);
    }
  }

  private registerVerificationRequestHandler(crypto: MatrixCryptoBootstrapApi): void {
    // Auto-accept incoming verification requests from other users/devices.
    crypto.on(CryptoEvent.VerificationRequestReceived, async (request) => {
      const verificationRequest = request as MatrixVerificationRequestLike;
      this.deps.verificationManager.trackVerificationRequest(verificationRequest);
      const otherUserId = verificationRequest.otherUserId;
      const isSelfVerification = verificationRequest.isSelfVerification;
      const initiatedByMe = verificationRequest.initiatedByMe;

      if (isSelfVerification || initiatedByMe) {
        LogService.debug(
          "MatrixClientLite",
          `Ignoring ${isSelfVerification ? "self" : "initiated"} verification request from ${otherUserId}`,
        );
        return;
      }

      try {
        LogService.info(
          "MatrixClientLite",
          `Auto-accepting verification request from ${otherUserId}`,
        );
        await verificationRequest.accept();
        LogService.info(
          "MatrixClientLite",
          `Verification request from ${otherUserId} accepted, waiting for SAS...`,
        );
      } catch (err) {
        LogService.warn(
          "MatrixClientLite",
          `Failed to auto-accept verification from ${otherUserId}:`,
          err,
        );
      }
    });

    this.deps.decryptBridge.bindCryptoRetrySignals(crypto);
    LogService.info("MatrixClientLite", "Verification request handler registered");
  }

  private async ensureOwnDeviceTrust(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    const deviceId = this.deps.getDeviceId()?.trim();
    if (!deviceId) {
      return;
    }
    const userId = await this.deps.getUserId();

    const deviceStatus =
      typeof crypto.getDeviceVerificationStatus === "function"
        ? await crypto.getDeviceVerificationStatus(userId, deviceId).catch(() => null)
        : null;
    const alreadyVerified =
      deviceStatus?.isVerified?.() === true ||
      deviceStatus?.localVerified === true ||
      deviceStatus?.crossSigningVerified === true ||
      deviceStatus?.signedByOwner === true;

    if (alreadyVerified) {
      return;
    }

    if (typeof crypto.setDeviceVerified === "function") {
      await crypto.setDeviceVerified(userId, deviceId, true);
    }

    if (typeof crypto.crossSignDevice === "function") {
      const crossSigningReady =
        typeof crypto.isCrossSigningReady === "function"
          ? await crypto.isCrossSigningReady()
          : true;
      if (crossSigningReady) {
        await crypto.crossSignDevice(deviceId);
      }
    }
  }
}
