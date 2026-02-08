import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatrixCryptoBootstrapApi, MatrixRawEvent } from "./types.js";
import { MatrixCryptoBootstrapper, type MatrixCryptoBootstrapperDeps } from "./crypto-bootstrap.js";

function createBootstrapperDeps() {
  return {
    getUserId: vi.fn(async () => "@bot:example.org"),
    getDeviceId: vi.fn(() => "DEVICE123"),
    verificationManager: {
      trackVerificationRequest: vi.fn(),
    },
    recoveryKeyStore: {
      bootstrapSecretStorageWithRecoveryKey: vi.fn(async () => {}),
    },
    decryptBridge: {
      bindCryptoRetrySignals: vi.fn(),
    },
  };
}

function createCryptoApi(overrides?: Partial<MatrixCryptoBootstrapApi>): MatrixCryptoBootstrapApi {
  return {
    on: vi.fn(),
    bootstrapCrossSigning: vi.fn(async () => {}),
    bootstrapSecretStorage: vi.fn(async () => {}),
    requestOwnUserVerification: vi.fn(async () => null),
    ...overrides,
  };
}

describe("MatrixCryptoBootstrapper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("bootstraps cross-signing/secret-storage and binds decrypt retry signals", async () => {
    const deps = createBootstrapperDeps();
    const crypto = createCryptoApi({
      getDeviceVerificationStatus: vi.fn(async () => ({
        isVerified: () => true,
      })),
    });
    const bootstrapper = new MatrixCryptoBootstrapper(
      deps as unknown as MatrixCryptoBootstrapperDeps<MatrixRawEvent>,
    );

    await bootstrapper.bootstrap(crypto);

    expect(crypto.bootstrapCrossSigning).toHaveBeenCalledWith({
      setupNewCrossSigning: true,
    });
    expect(deps.recoveryKeyStore.bootstrapSecretStorageWithRecoveryKey).toHaveBeenCalledWith(
      crypto,
    );
    expect(deps.decryptBridge.bindCryptoRetrySignals).toHaveBeenCalledWith(crypto);
  });

  it("marks own device verified and cross-signs it when needed", async () => {
    const deps = createBootstrapperDeps();
    const setDeviceVerified = vi.fn(async () => {});
    const crossSignDevice = vi.fn(async () => {});
    const crypto = createCryptoApi({
      getDeviceVerificationStatus: vi.fn(async () => ({
        isVerified: () => false,
        localVerified: false,
        crossSigningVerified: false,
        signedByOwner: false,
      })),
      setDeviceVerified,
      crossSignDevice,
      isCrossSigningReady: vi.fn(async () => true),
    });
    const bootstrapper = new MatrixCryptoBootstrapper(
      deps as unknown as MatrixCryptoBootstrapperDeps<MatrixRawEvent>,
    );

    await bootstrapper.bootstrap(crypto);

    expect(setDeviceVerified).toHaveBeenCalledWith("@bot:example.org", "DEVICE123", true);
    expect(crossSignDevice).toHaveBeenCalledWith("DEVICE123");
  });

  it("auto-accepts incoming verification requests from other users", async () => {
    const deps = createBootstrapperDeps();
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const crypto = createCryptoApi({
      getDeviceVerificationStatus: vi.fn(async () => ({
        isVerified: () => true,
      })),
      on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
        listeners.set(eventName, listener);
      }),
    });
    const bootstrapper = new MatrixCryptoBootstrapper(
      deps as unknown as MatrixCryptoBootstrapperDeps<MatrixRawEvent>,
    );

    await bootstrapper.bootstrap(crypto);

    const verificationRequest = {
      otherUserId: "@alice:example.org",
      isSelfVerification: false,
      initiatedByMe: false,
      accept: vi.fn(async () => {}),
    };
    const listener = Array.from(listeners.entries()).find(([eventName]) =>
      eventName.toLowerCase().includes("verificationrequest"),
    )?.[1];
    expect(listener).toBeTypeOf("function");
    await listener?.(verificationRequest);

    expect(deps.verificationManager.trackVerificationRequest).toHaveBeenCalledWith(
      verificationRequest,
    );
    expect(verificationRequest.accept).toHaveBeenCalledTimes(1);
  });
});
