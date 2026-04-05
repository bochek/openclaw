import type { SubscribeEmbeddedPiSessionParams } from "../../pi-embedded-subscribe.types.js";
import type { FlushPendingToolResultsAfterIdleOptions } from "../wait-for-idle-before-flush.js";
export function buildEmbeddedSubscriptionParams(
  params: SubscribeEmbeddedPiSessionParams,
): SubscribeEmbeddedPiSessionParams {
  return params;
}

export async function cleanupEmbeddedAttemptResources(params: {
  removeToolResultContextGuard?: () => void;
  flushPendingToolResultsAfterIdle: (
    params: FlushPendingToolResultsAfterIdleOptions,
  ) => Promise<void>;
  session?: { agent?: FlushPendingToolResultsAfterIdleOptions["agent"]; dispose(): void };
  sessionManager: FlushPendingToolResultsAfterIdleOptions["sessionManager"];
  releaseWsSession: (sessionId: string) => void;
  sessionId: string;
  bundleLspRuntime?: { dispose(): Promise<void> | void };
  sessionLock: { release(): Promise<void> | void };
}): Promise<void> {
  try {
    try {
      params.removeToolResultContextGuard?.();
    } catch {
      /* best-effort */
    }
    try {
      await params.flushPendingToolResultsAfterIdle({
        agent: params.session?.agent,
        sessionManager: params.sessionManager,
        clearPendingOnTimeout: true,
      });
    } catch {
      /* best-effort */
    }
    try {
      params.session?.dispose();
    } catch {
      /* best-effort */
    }
    try {
      params.releaseWsSession(params.sessionId);
    } catch {
      /* best-effort */
    }
    try {
      await params.bundleLspRuntime?.dispose();
    } catch {
      /* best-effort */
    }
  } finally {
    await params.sessionLock.release();
  }
}
