import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectStopPendingUntilAbort,
  startAccountAndTrackLifecycle,
  waitForStartedMocks,
} from "../../../test/helpers/extensions/start-account-lifecycle.js";
import type { ResolvedIrcAccount } from "./accounts.js";
import { startIrcGatewayAccount } from "./channel.gateway.js";
import { setIrcRuntime } from "./runtime.js";

const hoisted = vi.hoisted(() => ({
  monitorIrcProvider: vi.fn(),
}));

vi.mock("./monitor.js", () => ({
  monitorIrcProvider: hoisted.monitorIrcProvider,
}));

function buildAccount(): ResolvedIrcAccount {
  return {
    accountId: "default",
    enabled: true,
    name: "default",
    configured: true,
    host: "irc.example.com",
    port: 6697,
    tls: true,
    nick: "openclaw",
    username: "openclaw",
    realname: "OpenClaw",
    password: "",
    passwordSource: "none",
    config: {} as ResolvedIrcAccount["config"],
  };
}

function installIrcRuntime() {
  setIrcRuntime({
    logging: {
      shouldLogVerbose: vi.fn(() => false),
      getChildLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      })),
    },
    channel: {
      activity: {
        record: vi.fn(),
        get: vi.fn(),
      },
    },
  } as never);
}

describe("irc gateway", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps startAccount pending until abort, then stops the monitor", async () => {
    const stop = vi.fn();
    hoisted.monitorIrcProvider.mockResolvedValue({ stop });
    installIrcRuntime();

    const { abort, task, isSettled } = startAccountAndTrackLifecycle({
      startAccount: startIrcGatewayAccount,
      account: buildAccount(),
    });

    await expectStopPendingUntilAbort({
      waitForStarted: waitForStartedMocks(hoisted.monitorIrcProvider),
      isSettled,
      abort,
      task,
      stop,
    });
  });
});
