// Polyfill IndexedDB for WASM crypto in Node.js
import "fake-indexeddb/auto";
import { Attachment, EncryptedAttachment } from "@matrix-org/matrix-sdk-crypto-nodejs";
import {
  ClientEvent,
  createClient as createMatrixJsClient,
  type MatrixClient as MatrixJsClient,
  type MatrixEvent,
} from "matrix-js-sdk";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/CryptoEvent.js";
import { VerificationMethod } from "matrix-js-sdk/lib/types.js";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { MatrixDecryptBridge } from "./sdk/decrypt-bridge.js";
import { persistIdbToDisk, restoreIdbFromDisk } from "./sdk/idb-persistence.js";
import { ConsoleLogger, LogService, noop } from "./sdk/logger.js";
import { type HttpMethod, type QueryParams, performMatrixRequest } from "./sdk/transport.js";
import {
  type MatrixVerificationCryptoApi,
  MatrixVerificationManager,
  type MatrixVerificationMethod,
  type MatrixVerificationRequestLike,
  type MatrixVerificationSummary,
} from "./sdk/verification-manager.js";

export { ConsoleLogger, LogService };

type MatrixRawEvent = {
  event_id: string;
  sender: string;
  type: string;
  origin_server_ts: number;
  content: Record<string, unknown>;
  unsigned?: {
    age?: number;
    redacted_because?: unknown;
  };
  state_key?: string;
};

type MatrixClientEventMap = {
  "room.event": [roomId: string, event: MatrixRawEvent];
  "room.message": [roomId: string, event: MatrixRawEvent];
  "room.encrypted_event": [roomId: string, event: MatrixRawEvent];
  "room.decrypted_event": [roomId: string, event: MatrixRawEvent];
  "room.failed_decryption": [roomId: string, event: MatrixRawEvent, error: Error];
  "room.invite": [roomId: string, event: MatrixRawEvent];
  "room.join": [roomId: string, event: MatrixRawEvent];
};

export type EncryptedFile = {
  url: string;
  key: {
    kty: string;
    key_ops: string[];
    alg: string;
    k: string;
    ext: boolean;
  };
  iv: string;
  hashes: Record<string, string>;
  v: string;
};

export type FileWithThumbnailInfo = {
  size?: number;
  mimetype?: string;
  thumbnail_url?: string;
  thumbnail_info?: {
    w?: number;
    h?: number;
    mimetype?: string;
    size?: number;
  };
};

export type DimensionalFileInfo = FileWithThumbnailInfo & {
  w?: number;
  h?: number;
};

export type TimedFileInfo = FileWithThumbnailInfo & {
  duration?: number;
};

export type VideoFileInfo = DimensionalFileInfo &
  TimedFileInfo & {
    duration?: number;
  };

export type MessageEventContent = {
  msgtype?: string;
  body?: string;
  format?: string;
  formatted_body?: string;
  filename?: string;
  url?: string;
  file?: EncryptedFile;
  info?: Record<string, unknown>;
  "m.relates_to"?: Record<string, unknown>;
  "m.new_content"?: unknown;
  "m.mentions"?: {
    user_ids?: string[];
    room?: boolean;
  };
  [key: string]: unknown;
};

export type TextualMessageEventContent = MessageEventContent & {
  msgtype: string;
  body: string;
};

export type LocationMessageEventContent = MessageEventContent & {
  msgtype?: string;
  geo_uri?: string;
};

type MatrixCryptoFacade = {
  prepare: (joinedRooms: string[]) => Promise<void>;
  updateSyncData: (
    toDeviceMessages: unknown,
    otkCounts: unknown,
    unusedFallbackKeyAlgs: unknown,
    changedDeviceLists: unknown,
    leftDeviceLists: unknown,
  ) => Promise<void>;
  isRoomEncrypted: (roomId: string) => Promise<boolean>;
  requestOwnUserVerification: () => Promise<unknown | null>;
  encryptMedia: (buffer: Buffer) => Promise<{ buffer: Buffer; file: Omit<EncryptedFile, "url"> }>;
  decryptMedia: (file: EncryptedFile) => Promise<Buffer>;
  getRecoveryKey: () => Promise<{
    encodedPrivateKey?: string;
    keyId?: string | null;
    createdAt?: string;
  } | null>;
  listVerifications: () => Promise<MatrixVerificationSummary[]>;
  requestVerification: (params: {
    ownUser?: boolean;
    userId?: string;
    deviceId?: string;
    roomId?: string;
  }) => Promise<MatrixVerificationSummary>;
  acceptVerification: (id: string) => Promise<MatrixVerificationSummary>;
  cancelVerification: (
    id: string,
    params?: { reason?: string; code?: string },
  ) => Promise<MatrixVerificationSummary>;
  startVerification: (
    id: string,
    method?: MatrixVerificationMethod,
  ) => Promise<MatrixVerificationSummary>;
  generateVerificationQr: (id: string) => Promise<{ qrDataBase64: string }>;
  scanVerificationQr: (id: string, qrDataBase64: string) => Promise<MatrixVerificationSummary>;
  confirmVerificationSas: (id: string) => Promise<MatrixVerificationSummary>;
  mismatchVerificationSas: (id: string) => Promise<MatrixVerificationSummary>;
  confirmVerificationReciprocateQr: (id: string) => Promise<MatrixVerificationSummary>;
  getVerificationSas: (
    id: string,
  ) => Promise<{ decimal?: [number, number, number]; emoji?: Array<[string, string]> }>;
};

type MatrixSecretStorageStatus = {
  ready: boolean;
  defaultKeyId: string | null;
};

type MatrixGeneratedSecretStorageKey = {
  keyId?: string | null;
  keyInfo?: {
    passphrase?: unknown;
    name?: string;
  };
  privateKey: Uint8Array;
  encodedPrivateKey?: string;
};

type MatrixCryptoBootstrapApi = {
  on: (eventName: string, listener: (...args: unknown[]) => void) => void;
  bootstrapCrossSigning: (opts: { setupNewCrossSigning?: boolean }) => Promise<void>;
  bootstrapSecretStorage: (opts?: {
    createSecretStorageKey?: () => Promise<MatrixGeneratedSecretStorageKey>;
    setupNewSecretStorage?: boolean;
    setupNewKeyBackup?: boolean;
  }) => Promise<void>;
  createRecoveryKeyFromPassphrase?: (password?: string) => Promise<MatrixGeneratedSecretStorageKey>;
  getSecretStorageStatus?: () => Promise<MatrixSecretStorageStatus>;
  requestOwnUserVerification: () => Promise<unknown | null>;
  requestDeviceVerification?: (
    userId: string,
    deviceId: string,
  ) => Promise<MatrixVerificationRequestLike>;
  requestVerificationDM?: (
    userId: string,
    roomId: string,
  ) => Promise<MatrixVerificationRequestLike>;
  getDeviceVerificationStatus?: (
    userId: string,
    deviceId: string,
  ) => Promise<MatrixDeviceVerificationStatusLike | null>;
  setDeviceVerified?: (userId: string, deviceId: string, verified?: boolean) => Promise<void>;
  crossSignDevice?: (deviceId: string) => Promise<void>;
  isCrossSigningReady?: () => Promise<boolean>;
};

type MatrixDeviceVerificationStatusLike = {
  isVerified?: () => boolean;
  localVerified?: boolean;
  crossSigningVerified?: boolean;
  signedByOwner?: boolean;
};

type MatrixSecretStorageKeyDescription = {
  passphrase?: unknown;
  name?: string;
  [key: string]: unknown;
};

type MatrixCryptoCallbacks = {
  getSecretStorageKey?: (
    params: { keys: Record<string, MatrixSecretStorageKeyDescription> },
    name: string,
  ) => Promise<[string, Uint8Array] | null>;
  cacheSecretStorageKey?: (
    keyId: string,
    keyInfo: MatrixSecretStorageKeyDescription,
    key: Uint8Array,
  ) => void;
};

type MatrixStoredRecoveryKey = {
  version: 1;
  createdAt: string;
  keyId?: string | null;
  encodedPrivateKey?: string;
  privateKeyBase64: string;
  keyInfo?: {
    passphrase?: unknown;
    name?: string;
  };
};

export class MatrixClient {
  private readonly client: MatrixJsClient;
  private readonly emitter = new EventEmitter();
  private readonly homeserver: string;
  private readonly accessToken: string;
  private readonly localTimeoutMs: number;
  private readonly initialSyncLimit?: number;
  private readonly encryptionEnabled: boolean;
  private readonly recoveryKeyPath?: string;
  private readonly idbSnapshotPath?: string;
  private readonly cryptoDatabasePrefix?: string;
  private bridgeRegistered = false;
  private started = false;
  private selfUserId: string | null;
  private readonly dmRoomIds = new Set<string>();
  private cryptoInitialized = false;
  private readonly decryptBridge: MatrixDecryptBridge<MatrixRawEvent>;
  private readonly verificationManager = new MatrixVerificationManager();
  private readonly secretStorageKeyCache = new Map<
    string,
    { key: Uint8Array; keyInfo?: MatrixStoredRecoveryKey["keyInfo"] }
  >();

  readonly dms = {
    update: async (): Promise<void> => {
      await this.refreshDmCache();
    },
    isDm: (roomId: string): boolean => this.dmRoomIds.has(roomId),
  };

  crypto?: MatrixCryptoFacade;

  constructor(
    homeserver: string,
    accessToken: string,
    _storage?: unknown,
    _cryptoStorage?: unknown,
    opts: {
      userId?: string;
      deviceId?: string;
      localTimeoutMs?: number;
      encryption?: boolean;
      initialSyncLimit?: number;
      recoveryKeyPath?: string;
      idbSnapshotPath?: string;
      cryptoDatabasePrefix?: string;
    } = {},
  ) {
    this.homeserver = homeserver;
    this.accessToken = accessToken;
    this.localTimeoutMs = Math.max(1, opts.localTimeoutMs ?? 60_000);
    this.initialSyncLimit = opts.initialSyncLimit;
    this.encryptionEnabled = opts.encryption === true;
    this.recoveryKeyPath = opts.recoveryKeyPath;
    this.idbSnapshotPath = opts.idbSnapshotPath;
    this.cryptoDatabasePrefix = opts.cryptoDatabasePrefix;
    this.selfUserId = opts.userId?.trim() || null;
    const cryptoCallbacks = this.encryptionEnabled ? this.buildCryptoCallbacks() : undefined;
    this.client = createMatrixJsClient({
      baseUrl: homeserver,
      accessToken,
      userId: opts.userId,
      deviceId: opts.deviceId,
      localTimeoutMs: this.localTimeoutMs,
      cryptoCallbacks,
      verificationMethods: [
        VerificationMethod.Sas,
        VerificationMethod.ShowQrCode,
        VerificationMethod.ScanQrCode,
        VerificationMethod.Reciprocate,
      ],
    });
    this.decryptBridge = new MatrixDecryptBridge<MatrixRawEvent>({
      client: this.client,
      toRaw: (event) => matrixEventToRaw(event),
      emitDecryptedEvent: (roomId, event) => {
        this.emitter.emit("room.decrypted_event", roomId, event);
      },
      emitMessage: (roomId, event) => {
        this.emitter.emit("room.message", roomId, event);
      },
      emitFailedDecryption: (roomId, event, error) => {
        this.emitter.emit("room.failed_decryption", roomId, event, error);
      },
    });

    if (this.encryptionEnabled) {
      this.crypto = this.createCryptoFacade();
    }
  }

  on<TEvent extends keyof MatrixClientEventMap>(
    eventName: TEvent,
    listener: (...args: MatrixClientEventMap[TEvent]) => void,
  ): this;
  on(eventName: string, listener: (...args: unknown[]) => void): this;
  on(eventName: string, listener: (...args: unknown[]) => void): this {
    this.emitter.on(eventName, listener as (...args: unknown[]) => void);
    return this;
  }

  off<TEvent extends keyof MatrixClientEventMap>(
    eventName: TEvent,
    listener: (...args: MatrixClientEventMap[TEvent]) => void,
  ): this;
  off(eventName: string, listener: (...args: unknown[]) => void): this;
  off(eventName: string, listener: (...args: unknown[]) => void): this {
    this.emitter.off(eventName, listener as (...args: unknown[]) => void);
    return this;
  }

  private idbPersistTimer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.registerBridge();

    if (this.encryptionEnabled && !this.cryptoInitialized) {
      // Restore persisted IndexedDB crypto store before initializing WASM crypto
      await restoreIdbFromDisk(this.idbSnapshotPath);

      try {
        await this.client.initRustCrypto({
          cryptoDatabasePrefix: this.cryptoDatabasePrefix,
        });
        this.cryptoInitialized = true;

        // Bootstrap cross-signing and secret storage for automatic device verification
        const crypto = this.client.getCrypto() as MatrixCryptoBootstrapApi | undefined;
        if (crypto) {
          try {
            // Bootstrap cross-signing (create master/user-signing/self-signing keys if needed)
            await crypto.bootstrapCrossSigning({ setupNewCrossSigning: true });
            LogService.info("MatrixClientLite", "Cross-signing bootstrap complete");
          } catch (err) {
            LogService.warn("MatrixClientLite", "Failed to bootstrap cross-signing:", err);
          }
          try {
            // Bootstrap secret storage and ensure we have a recovery key.
            await this.bootstrapSecretStorageWithRecoveryKey(crypto);
            LogService.info("MatrixClientLite", "Secret storage bootstrap complete");
          } catch (err) {
            LogService.warn("MatrixClientLite", "Failed to bootstrap secret storage:", err);
          }
          try {
            await this.ensureOwnDeviceTrust(crypto);
          } catch (err) {
            LogService.warn("MatrixClientLite", "Failed to verify own Matrix device:", err);
          }

          // Auto-accept incoming verification requests from other users/devices
          // This allows Element to verify this device automatically without manual steps
          crypto.on(CryptoEvent.VerificationRequestReceived, async (request) => {
            const verificationRequest = request as MatrixVerificationRequestLike;
            this.verificationManager.trackVerificationRequest(verificationRequest);
            const otherUserId = verificationRequest.otherUserId;
            const isSelfVerification = verificationRequest.isSelfVerification;
            const initiatedByMe = verificationRequest.initiatedByMe;

            // Only auto-accept verifications from OTHER users (not self-verification)
            // and only if we didn't initiate the request
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

              // Accept the verification request (moves to Ready phase)
              await verificationRequest.accept();

              LogService.info(
                "MatrixClientLite",
                `Verification request from ${otherUserId} accepted, waiting for SAS...`,
              );

              // The SAS verification will complete automatically if the other side sends the accept
              // We don't need to do anything else - the SDK handles the full flow
            } catch (err) {
              LogService.warn(
                "MatrixClientLite",
                `Failed to auto-accept verification from ${otherUserId}:`,
                err,
              );
            }
          });

          this.decryptBridge.bindCryptoRetrySignals(crypto);

          LogService.info("MatrixClientLite", "Verification request handler registered");
        }

        // Persist the crypto store after successful init (captures fresh keys on first run)
        await persistIdbToDisk({
          snapshotPath: this.idbSnapshotPath,
          databasePrefix: this.cryptoDatabasePrefix,
        });

        // Periodically persist (every 60s) to capture new Olm sessions, room keys, etc.
        this.idbPersistTimer = setInterval(() => {
          persistIdbToDisk({
            snapshotPath: this.idbSnapshotPath,
            databasePrefix: this.cryptoDatabasePrefix,
          }).catch(noop);
        }, 60_000);
      } catch (err) {
        LogService.warn("MatrixClientLite", "Failed to initialize rust crypto:", err);
      }
    }

    await this.client.startClient({
      initialSyncLimit: this.initialSyncLimit,
    });
    this.started = true;
    await this.refreshDmCache().catch(noop);
  }

  stop(): void {
    if (this.idbPersistTimer) {
      clearInterval(this.idbPersistTimer);
      this.idbPersistTimer = null;
    }
    this.decryptBridge.stop();
    // Final persist on shutdown
    persistIdbToDisk({
      snapshotPath: this.idbSnapshotPath,
      databasePrefix: this.cryptoDatabasePrefix,
    }).catch(noop);
    this.client.stopClient();
    this.started = false;
  }

  private rememberSecretStorageKey(
    keyId: string,
    key: Uint8Array,
    keyInfo?: MatrixStoredRecoveryKey["keyInfo"],
  ): void {
    if (!keyId.trim()) {
      return;
    }
    this.secretStorageKeyCache.set(keyId, {
      key: new Uint8Array(key),
      keyInfo,
    });
  }

  private buildCryptoCallbacks(): MatrixCryptoCallbacks {
    return {
      getSecretStorageKey: async ({ keys }) => {
        const requestedKeyIds = Object.keys(keys ?? {});
        if (requestedKeyIds.length === 0) {
          return null;
        }

        for (const keyId of requestedKeyIds) {
          const cached = this.secretStorageKeyCache.get(keyId);
          if (cached) {
            return [keyId, new Uint8Array(cached.key)];
          }
        }

        const stored = this.loadStoredRecoveryKey();
        if (!stored || !stored.privateKeyBase64) {
          return null;
        }
        const privateKey = new Uint8Array(Buffer.from(stored.privateKeyBase64, "base64"));
        if (privateKey.length === 0) {
          return null;
        }

        if (stored.keyId && requestedKeyIds.includes(stored.keyId)) {
          this.rememberSecretStorageKey(stored.keyId, privateKey, stored.keyInfo);
          return [stored.keyId, privateKey];
        }

        // Fallback for older stored keys that predate keyId persistence.
        const firstRequestedKeyId = requestedKeyIds[0];
        if (!firstRequestedKeyId) {
          return null;
        }
        this.rememberSecretStorageKey(firstRequestedKeyId, privateKey, stored.keyInfo);
        return [firstRequestedKeyId, privateKey];
      },
      cacheSecretStorageKey: (keyId, keyInfo, key) => {
        const privateKey = new Uint8Array(key);
        const normalizedKeyInfo: MatrixStoredRecoveryKey["keyInfo"] = {
          passphrase: keyInfo?.passphrase,
          name: typeof keyInfo?.name === "string" ? keyInfo.name : undefined,
        };
        this.rememberSecretStorageKey(keyId, privateKey, normalizedKeyInfo);

        const stored = this.loadStoredRecoveryKey();
        this.saveRecoveryKeyToDisk({
          keyId,
          keyInfo: normalizedKeyInfo,
          privateKey,
          encodedPrivateKey: stored?.encodedPrivateKey,
        });
      },
    };
  }

  private loadStoredRecoveryKey(): MatrixStoredRecoveryKey | null {
    if (!this.recoveryKeyPath) {
      return null;
    }
    try {
      if (!fs.existsSync(this.recoveryKeyPath)) {
        return null;
      }
      const raw = fs.readFileSync(this.recoveryKeyPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<MatrixStoredRecoveryKey>;
      if (
        parsed.version !== 1 ||
        typeof parsed.createdAt !== "string" ||
        typeof parsed.privateKeyBase64 !== "string" ||
        !parsed.privateKeyBase64.trim()
      ) {
        return null;
      }
      return {
        version: 1,
        createdAt: parsed.createdAt,
        keyId: typeof parsed.keyId === "string" ? parsed.keyId : null,
        encodedPrivateKey:
          typeof parsed.encodedPrivateKey === "string" ? parsed.encodedPrivateKey : undefined,
        privateKeyBase64: parsed.privateKeyBase64,
        keyInfo:
          parsed.keyInfo && typeof parsed.keyInfo === "object"
            ? {
                passphrase: parsed.keyInfo.passphrase,
                name: typeof parsed.keyInfo.name === "string" ? parsed.keyInfo.name : undefined,
              }
            : undefined,
      };
    } catch {
      return null;
    }
  }

  private saveRecoveryKeyToDisk(params: MatrixGeneratedSecretStorageKey): void {
    if (!this.recoveryKeyPath) {
      return;
    }
    try {
      const payload: MatrixStoredRecoveryKey = {
        version: 1,
        createdAt: new Date().toISOString(),
        keyId: typeof params.keyId === "string" ? params.keyId : null,
        encodedPrivateKey: params.encodedPrivateKey,
        privateKeyBase64: Buffer.from(params.privateKey).toString("base64"),
        keyInfo: params.keyInfo
          ? {
              passphrase: params.keyInfo.passphrase,
              name: params.keyInfo.name,
            }
          : undefined,
      };
      fs.mkdirSync(path.dirname(this.recoveryKeyPath), { recursive: true });
      fs.writeFileSync(this.recoveryKeyPath, JSON.stringify(payload, null, 2), "utf8");
      fs.chmodSync(this.recoveryKeyPath, 0o600);
    } catch (err) {
      LogService.warn("MatrixClientLite", "Failed to persist recovery key:", err);
    }
  }

  private async bootstrapSecretStorageWithRecoveryKey(
    crypto: MatrixCryptoBootstrapApi,
  ): Promise<void> {
    let status: MatrixSecretStorageStatus | null = null;
    if (typeof crypto.getSecretStorageStatus === "function") {
      try {
        status = await crypto.getSecretStorageStatus();
      } catch (err) {
        LogService.warn("MatrixClientLite", "Failed to read secret storage status:", err);
      }
    }

    const hasDefaultSecretStorageKey = Boolean(status?.defaultKeyId);
    let generatedRecoveryKey = false;
    const storedRecovery = this.loadStoredRecoveryKey();
    let recoveryKey = storedRecovery
      ? {
          keyInfo: storedRecovery.keyInfo,
          privateKey: new Uint8Array(Buffer.from(storedRecovery.privateKeyBase64, "base64")),
          encodedPrivateKey: storedRecovery.encodedPrivateKey,
        }
      : null;

    if (recoveryKey && status?.defaultKeyId) {
      const defaultKeyId = status.defaultKeyId;
      this.rememberSecretStorageKey(defaultKeyId, recoveryKey.privateKey, recoveryKey.keyInfo);
      if (storedRecovery?.keyId !== defaultKeyId) {
        this.saveRecoveryKeyToDisk({
          keyId: defaultKeyId,
          keyInfo: recoveryKey.keyInfo,
          privateKey: recoveryKey.privateKey,
          encodedPrivateKey: recoveryKey.encodedPrivateKey,
        });
      }
    }

    const ensureRecoveryKey = async (): Promise<MatrixGeneratedSecretStorageKey> => {
      if (recoveryKey) {
        return recoveryKey;
      }
      if (typeof crypto.createRecoveryKeyFromPassphrase !== "function") {
        throw new Error(
          "Matrix crypto backend does not support recovery key generation (createRecoveryKeyFromPassphrase missing)",
        );
      }
      recoveryKey = await crypto.createRecoveryKeyFromPassphrase();
      this.saveRecoveryKeyToDisk(recoveryKey);
      generatedRecoveryKey = true;
      return recoveryKey;
    };

    const secretStorageOptions: {
      createSecretStorageKey?: () => Promise<MatrixGeneratedSecretStorageKey>;
      setupNewSecretStorage?: boolean;
      setupNewKeyBackup?: boolean;
    } = {
      setupNewKeyBackup: false,
    };

    if (!hasDefaultSecretStorageKey) {
      secretStorageOptions.setupNewSecretStorage = true;
      secretStorageOptions.createSecretStorageKey = ensureRecoveryKey;
    }

    await crypto.bootstrapSecretStorage(secretStorageOptions);

    if (generatedRecoveryKey && this.recoveryKeyPath) {
      LogService.warn(
        "MatrixClientLite",
        `Generated Matrix recovery key and saved it to ${this.recoveryKeyPath}. Keep this file secure.`,
      );
    }
  }

  private async ensureOwnDeviceTrust(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    const deviceId = this.client.getDeviceId()?.trim();
    if (!deviceId) {
      return;
    }
    const userId = await this.getUserId();

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

  async getUserId(): Promise<string> {
    const fromClient = this.client.getUserId();
    if (fromClient) {
      this.selfUserId = fromClient;
      return fromClient;
    }
    if (this.selfUserId) {
      return this.selfUserId;
    }
    const whoami = (await this.doRequest("GET", "/_matrix/client/v3/account/whoami")) as {
      user_id?: string;
    };
    const resolved = whoami.user_id?.trim();
    if (!resolved) {
      throw new Error("Matrix whoami did not return user_id");
    }
    this.selfUserId = resolved;
    return resolved;
  }

  async getJoinedRooms(): Promise<string[]> {
    const joined = await this.client.getJoinedRooms();
    return Array.isArray(joined.joined_rooms) ? joined.joined_rooms : [];
  }

  async getJoinedRoomMembers(roomId: string): Promise<string[]> {
    const members = await this.client.getJoinedRoomMembers(roomId);
    const joined = members?.joined;
    if (!joined || typeof joined !== "object") {
      return [];
    }
    return Object.keys(joined);
  }

  async getRoomStateEvent(
    roomId: string,
    eventType: string,
    stateKey = "",
  ): Promise<Record<string, unknown>> {
    const state = await this.client.getStateEvent(roomId, eventType, stateKey);
    return (state ?? {}) as Record<string, unknown>;
  }

  async getAccountData(eventType: string): Promise<Record<string, unknown> | undefined> {
    const event = this.client.getAccountData(eventType);
    return (event?.getContent() as Record<string, unknown> | undefined) ?? undefined;
  }

  async setAccountData(eventType: string, content: Record<string, unknown>): Promise<void> {
    await this.client.setAccountData(eventType as never, content as never);
    await this.refreshDmCache().catch(noop);
  }

  async resolveRoom(aliasOrRoomId: string): Promise<string | null> {
    if (aliasOrRoomId.startsWith("!")) {
      return aliasOrRoomId;
    }
    if (!aliasOrRoomId.startsWith("#")) {
      return aliasOrRoomId;
    }
    try {
      const resolved = await this.client.getRoomIdForAlias(aliasOrRoomId);
      return resolved.room_id ?? null;
    } catch {
      return null;
    }
  }

  async sendMessage(roomId: string, content: MessageEventContent): Promise<string> {
    const sent = await this.client.sendMessage(roomId, content as never);
    return sent.event_id;
  }

  async sendEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
  ): Promise<string> {
    const sent = await this.client.sendEvent(roomId, eventType as never, content as never);
    return sent.event_id;
  }

  async sendStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    content: Record<string, unknown>,
  ): Promise<string> {
    const sent = await this.client.sendStateEvent(
      roomId,
      eventType as never,
      content as never,
      stateKey,
    );
    return sent.event_id;
  }

  async redactEvent(roomId: string, eventId: string, reason?: string): Promise<string> {
    const sent = await this.client.redactEvent(
      roomId,
      eventId,
      undefined,
      reason?.trim() ? { reason } : undefined,
    );
    return sent.event_id;
  }

  async doRequest(
    method: HttpMethod,
    endpoint: string,
    qs?: QueryParams,
    body?: unknown,
  ): Promise<unknown> {
    return await this.requestJson({
      method,
      endpoint,
      qs,
      body,
      timeoutMs: this.localTimeoutMs,
    });
  }

  async getUserProfile(userId: string): Promise<{ displayname?: string; avatar_url?: string }> {
    return await this.client.getProfileInfo(userId);
  }

  async joinRoom(roomId: string): Promise<void> {
    await this.client.joinRoom(roomId);
  }

  mxcToHttp(mxcUrl: string): string | null {
    return this.client.mxcUrlToHttp(mxcUrl, undefined, undefined, undefined, true, false, true);
  }

  async downloadContent(mxcUrl: string, allowRemote = true): Promise<Buffer> {
    const parsed = parseMxc(mxcUrl);
    if (!parsed) {
      throw new Error(`Invalid Matrix content URI: ${mxcUrl}`);
    }
    const endpoint = `/_matrix/media/v3/download/${encodeURIComponent(parsed.server)}/${encodeURIComponent(parsed.mediaId)}`;
    const response = await this.requestRaw({
      method: "GET",
      endpoint,
      qs: { allow_remote: allowRemote },
      timeoutMs: this.localTimeoutMs,
    });
    return response;
  }

  async uploadContent(file: Buffer, contentType?: string, filename?: string): Promise<string> {
    const uploaded = await this.client.uploadContent(file, {
      type: contentType || "application/octet-stream",
      name: filename,
      includeFilename: Boolean(filename),
    });
    return uploaded.content_uri;
  }

  async getEvent(roomId: string, eventId: string): Promise<Record<string, unknown>> {
    return (await this.client.fetchRoomEvent(roomId, eventId)) as Record<string, unknown>;
  }

  async setTyping(roomId: string, typing: boolean, timeoutMs: number): Promise<void> {
    await this.client.sendTyping(roomId, typing, timeoutMs);
  }

  async sendReadReceipt(roomId: string, eventId: string): Promise<void> {
    await this.requestJson({
      method: "POST",
      endpoint: `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(
        eventId,
      )}`,
      body: {},
      timeoutMs: this.localTimeoutMs,
    });
  }

  private registerBridge(): void {
    if (this.bridgeRegistered) {
      return;
    }
    this.bridgeRegistered = true;

    this.client.on(ClientEvent.Event, (event: MatrixEvent) => {
      const roomId = event.getRoomId();
      if (!roomId) {
        return;
      }

      const raw = matrixEventToRaw(event);
      const isEncryptedEvent = raw.type === "m.room.encrypted";
      this.emitter.emit("room.event", roomId, raw);
      if (isEncryptedEvent) {
        this.emitter.emit("room.encrypted_event", roomId, raw);
      } else {
        if (this.decryptBridge.shouldEmitUnencryptedMessage(roomId, raw.event_id)) {
          this.emitter.emit("room.message", roomId, raw);
        }
      }

      const stateKey = raw.state_key ?? "";
      const selfUserId = this.client.getUserId() ?? this.selfUserId ?? "";
      const membership =
        raw.type === "m.room.member"
          ? (raw.content as { membership?: string }).membership
          : undefined;
      if (stateKey && selfUserId && stateKey === selfUserId) {
        if (membership === "invite") {
          this.emitter.emit("room.invite", roomId, raw);
        } else if (membership === "join") {
          this.emitter.emit("room.join", roomId, raw);
        }
      }

      if (isEncryptedEvent) {
        this.decryptBridge.attachEncryptedEvent(event, roomId);
      }
    });
  }

  private createCryptoFacade(): MatrixCryptoFacade {
    return {
      prepare: async (_joinedRooms: string[]) => {
        // matrix-js-sdk performs crypto prep during startup; no extra work required here.
      },
      updateSyncData: async (
        _toDeviceMessages: unknown,
        _otkCounts: unknown,
        _unusedFallbackKeyAlgs: unknown,
        _changedDeviceLists: unknown,
        _leftDeviceLists: unknown,
      ) => {
        // compatibility no-op
      },
      isRoomEncrypted: async (roomId: string): Promise<boolean> => {
        const room = this.client.getRoom(roomId);
        if (room?.hasEncryptionStateEvent()) {
          return true;
        }
        try {
          const event = await this.getRoomStateEvent(roomId, "m.room.encryption", "");
          return typeof event.algorithm === "string" && event.algorithm.length > 0;
        } catch {
          return false;
        }
      },
      requestOwnUserVerification: async (): Promise<unknown | null> => {
        const crypto = this.client.getCrypto() as MatrixVerificationCryptoApi | undefined;
        return await this.verificationManager.requestOwnUserVerification(crypto);
      },
      encryptMedia: async (
        buffer: Buffer,
      ): Promise<{ buffer: Buffer; file: Omit<EncryptedFile, "url"> }> => {
        const encrypted = Attachment.encrypt(new Uint8Array(buffer));
        const mediaInfoJson = encrypted.mediaEncryptionInfo;
        if (!mediaInfoJson) {
          throw new Error("Matrix media encryption failed: missing media encryption info");
        }
        const parsed = JSON.parse(mediaInfoJson) as EncryptedFile;
        return {
          buffer: Buffer.from(encrypted.encryptedData),
          file: {
            key: parsed.key,
            iv: parsed.iv,
            hashes: parsed.hashes,
            v: parsed.v,
          },
        };
      },
      decryptMedia: async (file: EncryptedFile): Promise<Buffer> => {
        const encrypted = await this.downloadContent(file.url);
        const metadata: EncryptedFile = {
          url: file.url,
          key: file.key,
          iv: file.iv,
          hashes: file.hashes,
          v: file.v,
        };
        const attachment = new EncryptedAttachment(
          new Uint8Array(encrypted),
          JSON.stringify(metadata),
        );
        const decrypted = Attachment.decrypt(attachment);
        return Buffer.from(decrypted);
      },
      getRecoveryKey: async () => {
        const stored = this.loadStoredRecoveryKey();
        if (!stored) {
          return null;
        }
        return {
          encodedPrivateKey: stored.encodedPrivateKey,
          keyId: stored.keyId,
          createdAt: stored.createdAt,
        };
      },
      listVerifications: async () => {
        return this.verificationManager.listVerifications();
      },
      requestVerification: async (params) => {
        const crypto = this.client.getCrypto() as MatrixVerificationCryptoApi | undefined;
        return await this.verificationManager.requestVerification(crypto, params);
      },
      acceptVerification: async (id) => {
        return await this.verificationManager.acceptVerification(id);
      },
      cancelVerification: async (id, params) => {
        return await this.verificationManager.cancelVerification(id, params);
      },
      startVerification: async (id, method = "sas") => {
        return await this.verificationManager.startVerification(id, method);
      },
      generateVerificationQr: async (id) => {
        return await this.verificationManager.generateVerificationQr(id);
      },
      scanVerificationQr: async (id, qrDataBase64) => {
        return await this.verificationManager.scanVerificationQr(id, qrDataBase64);
      },
      confirmVerificationSas: async (id) => {
        return await this.verificationManager.confirmVerificationSas(id);
      },
      mismatchVerificationSas: async (id) => {
        return this.verificationManager.mismatchVerificationSas(id);
      },
      confirmVerificationReciprocateQr: async (id) => {
        return this.verificationManager.confirmVerificationReciprocateQr(id);
      },
      getVerificationSas: async (id) => {
        return this.verificationManager.getVerificationSas(id);
      },
    };
  }

  private async refreshDmCache(): Promise<void> {
    const direct = await this.getAccountData("m.direct");
    this.dmRoomIds.clear();
    if (!direct || typeof direct !== "object") {
      return;
    }
    for (const value of Object.values(direct)) {
      if (!Array.isArray(value)) {
        continue;
      }
      for (const roomId of value) {
        if (typeof roomId === "string" && roomId.trim()) {
          this.dmRoomIds.add(roomId);
        }
      }
    }
  }

  private async requestJson(params: {
    method: HttpMethod;
    endpoint: string;
    qs?: QueryParams;
    body?: unknown;
    timeoutMs: number;
  }): Promise<unknown> {
    const { response, text } = await performMatrixRequest({
      homeserver: this.homeserver,
      accessToken: this.accessToken,
      method: params.method,
      endpoint: params.endpoint,
      qs: params.qs,
      body: params.body,
      timeoutMs: params.timeoutMs,
    });
    if (!response.ok) {
      throw buildHttpError(response.status, text);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      if (!text.trim()) {
        return {};
      }
      return JSON.parse(text);
    }
    return text;
  }

  private async requestRaw(params: {
    method: HttpMethod;
    endpoint: string;
    qs?: QueryParams;
    timeoutMs: number;
  }): Promise<Buffer> {
    const { response, buffer } = await performMatrixRequest({
      homeserver: this.homeserver,
      accessToken: this.accessToken,
      method: params.method,
      endpoint: params.endpoint,
      qs: params.qs,
      timeoutMs: params.timeoutMs,
      raw: true,
    });
    if (!response.ok) {
      throw buildHttpError(response.status, buffer.toString("utf8"));
    }
    return buffer;
  }
}

function matrixEventToRaw(event: MatrixEvent): MatrixRawEvent {
  const unsigned = (event.getUnsigned?.() ?? {}) as {
    age?: number;
    redacted_because?: unknown;
  };
  const raw: MatrixRawEvent = {
    event_id: event.getId() ?? "",
    sender: event.getSender() ?? "",
    type: event.getType() ?? "",
    origin_server_ts: event.getTs() ?? 0,
    content: ((event.getContent?.() ?? {}) as Record<string, unknown>) || {},
    unsigned,
  };
  const stateKey = resolveMatrixStateKey(event);
  if (typeof stateKey === "string") {
    raw.state_key = stateKey;
  }
  return raw;
}

function resolveMatrixStateKey(event: MatrixEvent): string | undefined {
  const direct = event.getStateKey?.();
  if (typeof direct === "string") {
    return direct;
  }
  const wireContent = (
    event as { getWireContent?: () => { state_key?: unknown } }
  ).getWireContent?.();
  if (wireContent && typeof wireContent.state_key === "string") {
    return wireContent.state_key;
  }
  const rawEvent = (event as { event?: { state_key?: unknown } }).event;
  if (rawEvent && typeof rawEvent.state_key === "string") {
    return rawEvent.state_key;
  }
  return undefined;
}

function parseMxc(url: string): { server: string; mediaId: string } | null {
  const match = /^mxc:\/\/([^/]+)\/(.+)$/.exec(url.trim());
  if (!match) {
    return null;
  }
  return {
    server: match[1],
    mediaId: match[2],
  };
}

function buildHttpError(statusCode: number, bodyText: string): Error & { statusCode: number } {
  let message = `Matrix HTTP ${statusCode}`;
  if (bodyText.trim()) {
    try {
      const parsed = JSON.parse(bodyText) as { error?: string };
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        message = parsed.error.trim();
      } else {
        message = bodyText.slice(0, 500);
      }
    } catch {
      message = bodyText.slice(0, 500);
    }
  }
  return Object.assign(new Error(message), { statusCode });
}
