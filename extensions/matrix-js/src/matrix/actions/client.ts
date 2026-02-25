import { getMatrixRuntime } from "../../runtime.js";
import type { CoreConfig } from "../../types.js";
import { getActiveMatrixClient } from "../active-client.js";
import { createMatrixClient, isBunRuntime, resolveMatrixAuth } from "../client.js";
import type { MatrixActionClient, MatrixActionClientOpts } from "./types.js";

export function ensureNodeRuntime() {
  if (isBunRuntime()) {
    throw new Error("Matrix support requires Node (bun runtime not supported)");
  }
}

export async function resolveActionClient(
  opts: MatrixActionClientOpts = {},
): Promise<MatrixActionClient> {
  ensureNodeRuntime();
  if (opts.client) {
    return { client: opts.client, stopOnDone: false };
  }
  const active = getActiveMatrixClient(opts.accountId);
  if (active) {
    return { client: active, stopOnDone: false };
  }
  const auth = await resolveMatrixAuth({
    cfg: getMatrixRuntime().config.loadConfig() as CoreConfig,
    accountId: opts.accountId,
  });
  const client = await createMatrixClient({
    homeserver: auth.homeserver,
    userId: auth.userId,
    accessToken: auth.accessToken,
    password: auth.password,
    deviceId: auth.deviceId,
    encryption: auth.encryption,
    localTimeoutMs: opts.timeoutMs,
    accountId: opts.accountId,
    autoBootstrapCrypto: false,
  });
  await client.prepareForOneOff();
  return { client, stopOnDone: true };
}
