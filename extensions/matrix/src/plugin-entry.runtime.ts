import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk/core";
import { createLazyPluginLocalModule } from "openclaw/plugin-sdk/lazy-runtime";
import { formatMatrixErrorMessage } from "./matrix/errors.js";

const loadMatrixDepsModule = createLazyPluginLocalModule<typeof import("./matrix/deps.js")>(
  import.meta.url,
  "./matrix/deps.js",
);
const loadMatrixVerificationModule = createLazyPluginLocalModule<
  typeof import("./matrix/actions/verification.js")
>(import.meta.url, "./matrix/actions/verification.js");

function sendError(respond: (ok: boolean, payload?: unknown) => void, err: unknown) {
  respond(false, { error: formatMatrixErrorMessage(err) });
}

export async function ensureMatrixCryptoRuntime(
  ...args: Parameters<typeof import("./matrix/deps.js").ensureMatrixCryptoRuntime>
): Promise<void> {
  const { ensureMatrixCryptoRuntime: ensureRuntime } = await loadMatrixDepsModule();
  await ensureRuntime(...args);
}

export async function handleVerifyRecoveryKey({
  params,
  respond,
}: GatewayRequestHandlerOptions): Promise<void> {
  try {
    const { verifyMatrixRecoveryKey } = await loadMatrixVerificationModule();
    const key = typeof params?.key === "string" ? params.key : "";
    if (!key.trim()) {
      respond(false, { error: "key required" });
      return;
    }
    const accountId =
      typeof params?.accountId === "string" ? params.accountId.trim() || undefined : undefined;
    const result = await verifyMatrixRecoveryKey(key, { accountId });
    respond(result.success, result);
  } catch (err) {
    sendError(respond, err);
  }
}

export async function handleVerificationBootstrap({
  params,
  respond,
}: GatewayRequestHandlerOptions): Promise<void> {
  try {
    const { bootstrapMatrixVerification } = await loadMatrixVerificationModule();
    const accountId =
      typeof params?.accountId === "string" ? params.accountId.trim() || undefined : undefined;
    const recoveryKey = typeof params?.recoveryKey === "string" ? params.recoveryKey : undefined;
    const forceResetCrossSigning = params?.forceResetCrossSigning === true;
    const result = await bootstrapMatrixVerification({
      accountId,
      recoveryKey,
      forceResetCrossSigning,
    });
    respond(result.success, result);
  } catch (err) {
    sendError(respond, err);
  }
}

export async function handleVerificationStatus({
  params,
  respond,
}: GatewayRequestHandlerOptions): Promise<void> {
  try {
    const { getMatrixVerificationStatus } = await loadMatrixVerificationModule();
    const accountId =
      typeof params?.accountId === "string" ? params.accountId.trim() || undefined : undefined;
    const includeRecoveryKey = params?.includeRecoveryKey === true;
    const status = await getMatrixVerificationStatus({ accountId, includeRecoveryKey });
    respond(true, status);
  } catch (err) {
    sendError(respond, err);
  }
}
