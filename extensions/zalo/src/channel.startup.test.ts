import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectLifecyclePatch,
  expectPendingUntilAbort,
  startAccountAndTrackLifecycle,
  waitForStartedMocks,
} from "../../../test/helpers/extensions/start-account-lifecycle.js";
import type { ResolvedZaloAccount } from "./accounts.js";
import {
  __resetLoadMonitorZaloProviderForTest,
  __resetResolveProbeZaloForTest,
  __setLoadMonitorZaloProviderForTest,
  __setResolveProbeZaloForTest,
} from "./channel.runtime.js";
import { zaloPlugin } from "./channel.js";

const hoisted = vi.hoisted(() => ({
  monitorZaloProvider: vi.fn(),
  probeZalo: vi.fn(async () => ({
    ok: false as const,
    error: "probe failed",
    elapsedMs: 1,
  })),
}));

function buildAccount(): ResolvedZaloAccount {
  return {
    accountId: "default",
    enabled: true,
    token: "test-token",
    tokenSource: "config",
    config: {},
  };
}

describe("zaloPlugin gateway.startAccount", () => {
  afterEach(() => {
    vi.clearAllMocks();
    __resetResolveProbeZaloForTest();
    __resetLoadMonitorZaloProviderForTest();
  });

  it("keeps startAccount pending until abort", async () => {
    __setResolveProbeZaloForTest(() => hoisted.probeZalo);
    __setLoadMonitorZaloProviderForTest(async () => hoisted.monitorZaloProvider);
    hoisted.monitorZaloProvider.mockImplementationOnce(
      async ({ abortSignal }: { abortSignal: AbortSignal }) =>
        await new Promise<void>((resolve) => {
          if (abortSignal.aborted) {
            resolve();
            return;
          }
          abortSignal.addEventListener("abort", () => resolve(), { once: true });
        }),
    );

    const { abort, patches, task, isSettled } = startAccountAndTrackLifecycle({
      startAccount: zaloPlugin.gateway!.startAccount!,
      account: buildAccount(),
    });

    await expectPendingUntilAbort({
      waitForStarted: waitForStartedMocks(hoisted.probeZalo, hoisted.monitorZaloProvider),
      isSettled,
      abort,
      task,
    });

    expectLifecyclePatch(patches, { accountId: "default" });
    expect(isSettled()).toBe(true);
    expect(hoisted.monitorZaloProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "test-token",
        account: expect.objectContaining({ accountId: "default" }),
        abortSignal: abort.signal,
        useWebhook: false,
      }),
    );
  });
});
