import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStorageMock } from "../test-helpers/storage.ts";
import { loadDeviceAuthToken, storeDeviceAuthToken } from "./device-auth.ts";
import type { DeviceIdentity } from "./device-identity.ts";
import {
  __testing as gatewayTesting,
  CONTROL_UI_OPERATOR_SCOPES,
  GatewayBrowserClient,
  shouldRetryWithDeviceToken,
} from "./gateway.ts";

const wsInstances = vi.hoisted((): MockWebSocket[] => []);
const loadOrCreateDeviceIdentityMock = vi.hoisted(() =>
  vi.fn(
    async (): Promise<DeviceIdentity> => ({
      deviceId: "device-1",
      privateKey: "private-key", // pragma: allowlist secret
      publicKey: "public-key", // pragma: allowlist secret
    }),
  ),
);
const signDevicePayloadMock = vi.hoisted(() =>
  vi.fn(async (_privateKeyBase64Url: string, _payload: string) => "signature"),
);
const activeClients = vi.hoisted((): Array<InstanceType<typeof GatewayBrowserClient>> => []);

type HandlerMap = {
  close: MockWebSocketHandler[];
  error: MockWebSocketHandler[];
  message: MockWebSocketHandler[];
  open: MockWebSocketHandler[];
};

type MockWebSocketHandler = (ev?: { code?: number; data?: string; reason?: string }) => void;

class MockWebSocket {
  static OPEN = 1;

  readonly handlers: HandlerMap = {
    close: [],
    error: [],
    message: [],
    open: [],
  };

  readonly sent: string[] = [];
  readyState = MockWebSocket.OPEN;

  constructor(_url: string) {
    wsInstances.push(this);
  }

  addEventListener(type: keyof HandlerMap, handler: MockWebSocketHandler) {
    this.handlers[type].push(handler);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  emitClose(code = 1000, reason = "") {
    for (const handler of this.handlers.close) {
      handler({ code, reason });
    }
  }

  emitOpen() {
    for (const handler of this.handlers.open) {
      handler();
    }
  }

  emitMessage(data: unknown) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    for (const handler of this.handlers.message) {
      handler({ data: payload });
    }
  }
}

type ConnectFrame = {
  id?: string;
  method?: string;
  params?: {
    auth?: { token?: string; password?: string; deviceToken?: string };
    scopes?: string[];
  };
};

function stubWindowGlobals(storage?: ReturnType<typeof createStorageMock>) {
  vi.stubGlobal("window", {
    location: { href: "http://127.0.0.1:18789/" },
    localStorage: storage,
    setTimeout: (handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) =>
      globalThis.setTimeout(() => handler(...args), timeout),
    clearTimeout: (timeoutId: number | undefined) => globalThis.clearTimeout(timeoutId),
  });
}

function getLatestWebSocket(): MockWebSocket {
  const ws = wsInstances.at(-1);
  if (!ws) {
    throw new Error("missing websocket instance");
  }
  return ws;
}

function stubInsecureCrypto() {
  vi.stubGlobal("crypto", {
    randomUUID: () => "req-insecure",
  });
}

function parseLatestConnectFrame(ws: MockWebSocket): ConnectFrame {
  return JSON.parse(ws.sent.at(-1) ?? "{}") as ConnectFrame;
}

async function continueConnect(ws: MockWebSocket, nonce = "nonce-1") {
  ws.emitOpen();
  ws.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: { nonce },
  });
  await waitForMs(5);
  expect(ws.sent.length).toBeGreaterThan(0);
  return { ws, connectFrame: parseLatestConnectFrame(ws) };
}

async function waitForMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startConnect(client: InstanceType<typeof GatewayBrowserClient>, nonce = "nonce-1") {
  client.start();
  return await continueConnect(getLatestWebSocket(), nonce);
}

async function emitRetryableTokenMismatch(ws: MockWebSocket, connectId: string | undefined) {
  ws.emitMessage({
    type: "res",
    id: connectId,
    ok: false,
    error: {
      code: "INVALID_REQUEST",
      message: "unauthorized",
      details: { code: "AUTH_TOKEN_MISMATCH", canRetryWithDeviceToken: true },
    },
  });
  await waitForMs(5);
}

async function startRetriedDeviceTokenConnect(params: {
  url: string;
  token: string;
  retryNonce?: string;
}) {
  const client = new GatewayBrowserClient({
    url: params.url,
    token: params.token,
  });
  activeClients.push(client);
  const { ws: firstWs, connectFrame: firstConnect } = await startConnect(client);
  expect(firstConnect.params?.auth?.token).toBe(params.token);
  expect(firstConnect.params?.auth?.deviceToken).toBeUndefined();

  await emitRetryableTokenMismatch(firstWs, firstConnect.id);
  expect(firstWs.readyState).toBe(3);
  firstWs.emitClose(4008, "connect failed");

  await waitForMs(10);
  expect(wsInstances).toHaveLength(2);
  const secondWs = getLatestWebSocket();
  expect(secondWs).not.toBe(firstWs);
  const { connectFrame: secondConnect } = await continueConnect(
    secondWs,
    params.retryNonce ?? "nonce-2",
  );
  expect(secondConnect.params?.auth?.token).toBe(params.token);
  expect(secondConnect.params?.auth?.deviceToken).toBe("stored-device-token");

  return { client, firstWs, secondWs, firstConnect, secondConnect };
}

describe("GatewayBrowserClient", () => {
  function createClient(
    opts: ConstructorParameters<typeof GatewayBrowserClient>[0],
  ): InstanceType<typeof GatewayBrowserClient> {
    const client = new GatewayBrowserClient(opts);
    activeClients.push(client);
    return client;
  }

  beforeEach(() => {
    const storage = createStorageMock();
    activeClients.length = 0;
    wsInstances.length = 0;
    gatewayTesting.resetTimingForTest();
    gatewayTesting.resetDepsForTest();
    gatewayTesting.setDepsForTest({
      loadOrCreateDeviceIdentity: loadOrCreateDeviceIdentityMock,
      signDevicePayload: signDevicePayloadMock,
    });
    gatewayTesting.setTimingForTest({
      connectSendDelayMs: 1,
      initialBackoffMs: 1,
      maxBackoffMs: 5,
    });
    loadOrCreateDeviceIdentityMock.mockReset();
    signDevicePayloadMock.mockClear();
    loadOrCreateDeviceIdentityMock.mockResolvedValue({
      deviceId: "device-1",
      privateKey: "private-key", // pragma: allowlist secret
      publicKey: "public-key", // pragma: allowlist secret
    });

    vi.stubGlobal("localStorage", storage);
    stubWindowGlobals(storage);
    localStorage.clear();
    vi.stubGlobal("WebSocket", MockWebSocket);

    storeDeviceAuthToken({
      deviceId: "device-1",
      role: "operator",
      token: "stored-device-token",
      scopes: [...CONTROL_UI_OPERATOR_SCOPES],
    });
  });

  afterEach(() => {
    for (const client of activeClients) {
      client.stop();
    }
    gatewayTesting.resetDepsForTest();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests the full control ui operator scope bundle on connect", async () => {
    const client = createClient({
      url: "ws://127.0.0.1:18789",
      token: "shared-auth-token",
    });

    const { connectFrame } = await startConnect(client);

    expect(connectFrame.method).toBe("connect");
    expect(connectFrame.params?.scopes).toEqual([...CONTROL_UI_OPERATOR_SCOPES]);
  });

  it("prefers explicit shared auth over cached device tokens", async () => {
    const client = createClient({
      url: "ws://127.0.0.1:18789",
      token: "shared-auth-token",
    });

    const { connectFrame } = await startConnect(client);

    expect(typeof connectFrame.id).toBe("string");
    expect(connectFrame.method).toBe("connect");
    expect(connectFrame.params?.auth?.token).toBe("shared-auth-token");
    expect(signDevicePayloadMock).toHaveBeenCalledWith("private-key", expect.any(String));
    const signedPayload = signDevicePayloadMock.mock.calls[0]?.[1];
    expect(signedPayload).toContain("|shared-auth-token|nonce-1");
    expect(signedPayload).not.toContain("stored-device-token");
  });

  it("sends explicit shared token on insecure first connect without cached device fallback", async () => {
    stubInsecureCrypto();
    const client = createClient({
      url: "ws://gateway.example:18789",
      token: "shared-auth-token",
    });

    const { connectFrame } = await startConnect(client);

    expect(connectFrame.id).toBe("req-insecure");
    expect(connectFrame.method).toBe("connect");
    expect(connectFrame.params?.auth).toEqual({
      token: "shared-auth-token",
      password: undefined,
      deviceToken: undefined,
    });
    expect(loadOrCreateDeviceIdentityMock).not.toHaveBeenCalled();
    expect(signDevicePayloadMock).not.toHaveBeenCalled();
  });

  it("sends explicit shared password on insecure first connect without cached device fallback", async () => {
    stubInsecureCrypto();
    const client = createClient({
      url: "ws://gateway.example:18789",
      password: "shared-password", // pragma: allowlist secret
    });

    const { connectFrame } = await startConnect(client);

    expect(connectFrame.id).toBe("req-insecure");
    expect(connectFrame.method).toBe("connect");
    expect(connectFrame.params?.auth).toEqual({
      token: undefined,
      password: "shared-password", // pragma: allowlist secret
      deviceToken: undefined,
    });
    expect(loadOrCreateDeviceIdentityMock).not.toHaveBeenCalled();
    expect(signDevicePayloadMock).not.toHaveBeenCalled();
  });

  it("uses cached device tokens only when no explicit shared auth is provided", async () => {
    const client = createClient({
      url: "ws://127.0.0.1:18789",
    });

    const { connectFrame } = await startConnect(client);

    expect(typeof connectFrame.id).toBe("string");
    expect(connectFrame.method).toBe("connect");
    expect(connectFrame.params?.auth?.token).toBe("stored-device-token");
    expect(signDevicePayloadMock).toHaveBeenCalledWith("private-key", expect.any(String));
    const signedPayload = signDevicePayloadMock.mock.calls[0]?.[1];
    expect(signedPayload).toContain("|stored-device-token|nonce-1");
  });

  it("ignores cached operator device tokens that do not include read access", async () => {
    localStorage.clear();
    storeDeviceAuthToken({
      deviceId: "device-1",
      role: "operator",
      token: "under-scoped-device-token",
      scopes: [],
    });

    const client = createClient({
      url: "ws://127.0.0.1:18789",
    });

    const { connectFrame } = await startConnect(client);

    expect(connectFrame.method).toBe("connect");
    expect(connectFrame.params?.auth?.token).toBeUndefined();
    const signedPayload = signDevicePayloadMock.mock.calls[0]?.[1];
    expect(signedPayload).not.toContain("under-scoped-device-token");
  });

  it("retries once with device token after token mismatch when shared token is explicit", async () => {
    const { secondWs, secondConnect } = await startRetriedDeviceTokenConnect({
      url: "ws://127.0.0.1:18789",
      token: "shared-auth-token",
    });

    secondWs.emitMessage({
      type: "res",
      id: secondConnect.id,
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "unauthorized",
        details: { code: "AUTH_TOKEN_MISMATCH" },
      },
    });
    await waitForMs(5);
    expect(secondWs.readyState).toBe(3);
    secondWs.emitClose(4008, "connect failed");
    expect(loadDeviceAuthToken({ deviceId: "device-1", role: "operator" })?.token).toBe(
      "stored-device-token",
    );
    await waitForMs(10);
    expect(wsInstances).toHaveLength(2);
  });

  it("treats IPv6 loopback as trusted for bounded device-token retry", async () => {
    const { client } = await startRetriedDeviceTokenConnect({
      url: "ws://[::1]:18789",
      token: "shared-auth-token",
    });

    client.stop();
  });

  it("continues reconnecting on first token mismatch when no retry was attempted", async () => {
    localStorage.clear();

    const client = createClient({
      url: "ws://127.0.0.1:18789",
      token: "shared-auth-token",
    });

    const { ws: ws1, connectFrame: firstConnect } = await startConnect(client);

    ws1.emitMessage({
      type: "res",
      id: firstConnect.id,
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "unauthorized",
        details: { code: "AUTH_TOKEN_MISMATCH" },
      },
    });
    await waitForMs(5);
    expect(ws1.readyState).toBe(3);
    ws1.emitClose(4008, "connect failed");

    await waitForMs(10);
    expect(wsInstances).toHaveLength(2);

    client.stop();
  });

  it("cancels a queued connect send when stopped before the timeout fires", async () => {
    const client = createClient({
      url: "ws://127.0.0.1:18789",
      token: "shared-auth-token",
    });

    client.start();
    const ws = getLatestWebSocket();
    ws.emitOpen();

    client.stop();
    await waitForMs(10);

    expect(ws.sent).toHaveLength(0);
  });

  it("does not auto-reconnect on AUTH_TOKEN_MISSING", async () => {
    localStorage.clear();

    const client = createClient({
      url: "ws://127.0.0.1:18789",
    });

    const { ws: ws1, connectFrame: connect } = await startConnect(client);

    ws1.emitMessage({
      type: "res",
      id: connect.id,
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "unauthorized",
        details: { code: "AUTH_TOKEN_MISSING" },
      },
    });
    await waitForMs(5);
    expect(ws1.readyState).toBe(3);
    ws1.emitClose(4008, "connect failed");

    await waitForMs(10);
    expect(wsInstances).toHaveLength(1);
  });
});

describe("shouldRetryWithDeviceToken", () => {
  beforeEach(() => {
    stubWindowGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows a bounded retry for trusted loopback endpoints", () => {
    expect(
      shouldRetryWithDeviceToken({
        deviceTokenRetryBudgetUsed: false,
        authDeviceToken: undefined,
        explicitGatewayToken: "shared-auth-token",
        deviceIdentity: {
          deviceId: "device-1",
          privateKey: "private-key", // pragma: allowlist secret
          publicKey: "public-key", // pragma: allowlist secret
        },
        storedToken: "stored-device-token",
        canRetryWithDeviceTokenHint: true,
        url: "ws://127.0.0.1:18789",
      }),
    ).toBe(true);
  });

  it("blocks the retry after the one-shot budget is spent", () => {
    expect(
      shouldRetryWithDeviceToken({
        deviceTokenRetryBudgetUsed: true,
        authDeviceToken: undefined,
        explicitGatewayToken: "shared-auth-token",
        deviceIdentity: {
          deviceId: "device-1",
          privateKey: "private-key", // pragma: allowlist secret
          publicKey: "public-key", // pragma: allowlist secret
        },
        storedToken: "stored-device-token",
        canRetryWithDeviceTokenHint: true,
        url: "ws://127.0.0.1:18789",
      }),
    ).toBe(false);
  });
});
