import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing, matrixPlugin } from "./channel.js";

const sendMessageMatrixMock = vi.hoisted(() => vi.fn());
const probeMatrixMock = vi.hoisted(() => vi.fn());
const resolveMatrixAuthMock = vi.hoisted(() => vi.fn());

describe("matrix account path propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testing.setLoadMatrixChannelRuntimeForTest(async () => ({
      probeMatrix: (...args: unknown[]) => probeMatrixMock(...args),
      resolveMatrixAuth: (...args: unknown[]) => resolveMatrixAuthMock(...args),
      sendMessageMatrix: (...args: unknown[]) => sendMessageMatrixMock(...args),
    }));
    sendMessageMatrixMock.mockResolvedValue({
      messageId: "$sent",
      roomId: "!room:example.org",
    });
    probeMatrixMock.mockResolvedValue({
      ok: true,
      error: null,
      status: null,
      elapsedMs: 5,
      userId: "@poe:example.org",
    });
    resolveMatrixAuthMock.mockResolvedValue({
      accountId: "poe",
      homeserver: "https://matrix.example.org",
      userId: "@poe:example.org",
      accessToken: "poe-token",
    });
  });

  afterEach(() => {
    __testing.resetLoadMatrixChannelRuntimeForTest();
  });

  it("forwards accountId when notifying pairing approval", async () => {
    await matrixPlugin.pairing!.notifyApproval?.({
      cfg: {},
      id: "@user:example.org",
      accountId: "poe",
    });

    expect(sendMessageMatrixMock).toHaveBeenCalledWith(
      "user:@user:example.org",
      expect.any(String),
      { accountId: "poe" },
    );
  });

  it("forwards accountId to matrix probes", async () => {
    await matrixPlugin.status!.probeAccount?.({
      cfg: {} as never,
      timeoutMs: 500,
      account: {
        accountId: "poe",
      } as never,
    });

    expect(resolveMatrixAuthMock).toHaveBeenCalledWith({
      cfg: {},
      accountId: "poe",
    });
    expect(probeMatrixMock).toHaveBeenCalledWith({
      homeserver: "https://matrix.example.org",
      accessToken: "poe-token",
      userId: "@poe:example.org",
      timeoutMs: 500,
      accountId: "poe",
    });
  });
});
