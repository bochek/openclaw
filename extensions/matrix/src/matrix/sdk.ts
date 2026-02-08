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
import type {
  EncryptedFile,
  LocationMessageEventContent,
  MatrixClientEventMap,
  MatrixCryptoBootstrapApi,
  MatrixDeviceVerificationStatusLike,
  MatrixRawEvent,
  MessageEventContent,
  TextualMessageEventContent,
} from "./sdk/types.js";
import { MatrixDecryptBridge } from "./sdk/decrypt-bridge.js";
import { matrixEventToRaw, parseMxc } from "./sdk/event-helpers.js";
import { MatrixAuthedHttpClient } from "./sdk/http-client.js";
import { persistIdbToDisk, restoreIdbFromDisk } from "./sdk/idb-persistence.js";
import { ConsoleLogger, LogService, noop } from "./sdk/logger.js";
import { MatrixRecoveryKeyStore } from "./sdk/recovery-key-store.js";
import { type HttpMethod, type QueryParams } from "./sdk/transport.js";
import {
  type MatrixVerificationCryptoApi,
  MatrixVerificationManager,
  type MatrixVerificationMethod,
  type MatrixVerificationRequestLike,
  type MatrixVerificationSummary,
} from "./sdk/verification-manager.js";

export { ConsoleLogger, LogService };
export type {
  DimensionalFileInfo,
  FileWithThumbnailInfo,
  TimedFileInfo,
  VideoFileInfo,
} from "./sdk/types.js";
export type {
  EncryptedFile,
  LocationMessageEventContent,
  MessageEventContent,
  TextualMessageEventContent,
} from "./sdk/types.js";

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

export class MatrixClient {
  private readonly client: MatrixJsClient;
  private readonly emitter = new EventEmitter();
  private readonly httpClient: MatrixAuthedHttpClient;
  private readonly localTimeoutMs: number;
  private readonly initialSyncLimit?: number;
  private readonly encryptionEnabled: boolean;
  private readonly idbSnapshotPath?: string;
  private readonly cryptoDatabasePrefix?: string;
  private bridgeRegistered = false;
  private started = false;
  private selfUserId: string | null;
  private readonly dmRoomIds = new Set<string>();
  private cryptoInitialized = false;
  private readonly decryptBridge: MatrixDecryptBridge<MatrixRawEvent>;
  private readonly verificationManager = new MatrixVerificationManager();
  private readonly recoveryKeyStore: MatrixRecoveryKeyStore;

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
    this.httpClient = new MatrixAuthedHttpClient(homeserver, accessToken);
    this.localTimeoutMs = Math.max(1, opts.localTimeoutMs ?? 60_000);
    this.initialSyncLimit = opts.initialSyncLimit;
    this.encryptionEnabled = opts.encryption === true;
    this.idbSnapshotPath = opts.idbSnapshotPath;
    this.cryptoDatabasePrefix = opts.cryptoDatabasePrefix;
    this.selfUserId = opts.userId?.trim() || null;
    this.recoveryKeyStore = new MatrixRecoveryKeyStore(opts.recoveryKeyPath);
    const cryptoCallbacks = this.encryptionEnabled
      ? this.recoveryKeyStore.buildCryptoCallbacks()
      : undefined;
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
    await this.initializeCryptoIfNeeded();

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

  private async initializeCryptoIfNeeded(): Promise<void> {
    if (!this.encryptionEnabled || this.cryptoInitialized) {
      return;
    }

    // Restore persisted IndexedDB crypto store before initializing WASM crypto.
    await restoreIdbFromDisk(this.idbSnapshotPath);

    try {
      await this.client.initRustCrypto({
        cryptoDatabasePrefix: this.cryptoDatabasePrefix,
      });
      this.cryptoInitialized = true;

      const crypto = this.client.getCrypto() as MatrixCryptoBootstrapApi | undefined;
      if (crypto) {
        await this.bootstrapCryptoIdentity(crypto);
        this.registerVerificationRequestHandler(crypto);
      }

      // Persist the crypto store after successful init (captures fresh keys on first run).
      await persistIdbToDisk({
        snapshotPath: this.idbSnapshotPath,
        databasePrefix: this.cryptoDatabasePrefix,
      });

      // Periodically persist to capture new Olm sessions and room keys.
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

  private async bootstrapCryptoIdentity(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    try {
      await crypto.bootstrapCrossSigning({ setupNewCrossSigning: true });
      LogService.info("MatrixClientLite", "Cross-signing bootstrap complete");
    } catch (err) {
      LogService.warn("MatrixClientLite", "Failed to bootstrap cross-signing:", err);
    }
    try {
      await this.recoveryKeyStore.bootstrapSecretStorageWithRecoveryKey(crypto);
      LogService.info("MatrixClientLite", "Secret storage bootstrap complete");
    } catch (err) {
      LogService.warn("MatrixClientLite", "Failed to bootstrap secret storage:", err);
    }
    try {
      await this.ensureOwnDeviceTrust(crypto);
    } catch (err) {
      LogService.warn("MatrixClientLite", "Failed to verify own Matrix device:", err);
    }
  }

  private registerVerificationRequestHandler(crypto: MatrixCryptoBootstrapApi): void {
    // Auto-accept incoming verification requests from other users/devices.
    crypto.on(CryptoEvent.VerificationRequestReceived, async (request) => {
      const verificationRequest = request as MatrixVerificationRequestLike;
      this.verificationManager.trackVerificationRequest(verificationRequest);
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

    this.decryptBridge.bindCryptoRetrySignals(crypto);
    LogService.info("MatrixClientLite", "Verification request handler registered");
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
        return this.recoveryKeyStore.getRecoveryKeySummary();
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
    return await this.httpClient.requestJson(params);
  }

  private async requestRaw(params: {
    method: HttpMethod;
    endpoint: string;
    qs?: QueryParams;
    timeoutMs: number;
  }): Promise<Buffer> {
    return await this.httpClient.requestRaw(params);
  }
}
