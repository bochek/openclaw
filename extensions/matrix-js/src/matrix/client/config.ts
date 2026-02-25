import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { getMatrixRuntime } from "../../runtime.js";
import type { CoreConfig } from "../../types.js";
import { MatrixClient } from "../sdk.js";
import { ensureMatrixSdkLoggingConfigured } from "./logging.js";
import {
  finalizeMatrixRegisterConfigAfterSuccess,
  prepareMatrixRegisterMode,
} from "./register-mode.js";
import type { MatrixAuth, MatrixResolvedConfig } from "./types.js";

function clean(value?: string): string {
  return value?.trim() ?? "";
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function findAccountConfig(cfg: CoreConfig, accountId: string): Record<string, unknown> {
  const accounts = cfg.channels?.["matrix-js"]?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return {};
  }
  if (accounts[accountId] && typeof accounts[accountId] === "object") {
    return accounts[accountId] as Record<string, unknown>;
  }
  const normalized = normalizeAccountId(accountId);
  for (const key of Object.keys(accounts)) {
    if (normalizeAccountId(key) === normalized) {
      const candidate = accounts[key];
      if (candidate && typeof candidate === "object") {
        return candidate as Record<string, unknown>;
      }
      return {};
    }
  }
  return {};
}

function resolveMatrixLocalpart(userId: string): string {
  const trimmed = userId.trim();
  const noPrefix = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const localpart = noPrefix.split(":")[0]?.trim() || "";
  if (!localpart) {
    throw new Error(`Invalid Matrix userId for registration: ${userId}`);
  }
  return localpart;
}

async function registerMatrixPasswordAccount(params: {
  homeserver: string;
  userId: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
}): Promise<{
  access_token?: string;
  user_id?: string;
  device_id?: string;
}> {
  const registerClient = new MatrixClient(params.homeserver, "");
  const payload = {
    username: resolveMatrixLocalpart(params.userId),
    password: params.password,
    inhibit_login: false,
    device_id: params.deviceId,
    initial_device_display_name: params.deviceName ?? "OpenClaw Gateway",
  };

  let firstError: unknown = null;
  try {
    return (await registerClient.doRequest("POST", "/_matrix/client/v3/register", undefined, {
      ...payload,
      auth: { type: "m.login.dummy" },
    })) as {
      access_token?: string;
      user_id?: string;
      device_id?: string;
    };
  } catch (err) {
    firstError = err;
  }

  try {
    return (await registerClient.doRequest(
      "POST",
      "/_matrix/client/v3/register",
      undefined,
      payload,
    )) as {
      access_token?: string;
      user_id?: string;
      device_id?: string;
    };
  } catch (err) {
    const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
    const secondMessage = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Matrix registration failed (dummy auth: ${firstMessage}; plain registration: ${secondMessage})`,
    );
  }
}

export function resolveMatrixConfig(
  cfg: CoreConfig = getMatrixRuntime().config.loadConfig() as CoreConfig,
  env: NodeJS.ProcessEnv = process.env,
): MatrixResolvedConfig {
  const matrix = cfg.channels?.["matrix-js"] ?? {};
  const homeserver = clean(matrix.homeserver) || clean(env.MATRIX_HOMESERVER);
  const userId = clean(matrix.userId) || clean(env.MATRIX_USER_ID);
  const accessToken = clean(matrix.accessToken) || clean(env.MATRIX_ACCESS_TOKEN) || undefined;
  const password = clean(matrix.password) || clean(env.MATRIX_PASSWORD) || undefined;
  const register =
    parseOptionalBoolean(matrix.register) ?? parseOptionalBoolean(env.MATRIX_REGISTER) ?? false;
  const deviceId = clean(matrix.deviceId) || clean(env.MATRIX_DEVICE_ID) || undefined;
  const deviceName = clean(matrix.deviceName) || clean(env.MATRIX_DEVICE_NAME) || undefined;
  const initialSyncLimit =
    typeof matrix.initialSyncLimit === "number"
      ? Math.max(0, Math.floor(matrix.initialSyncLimit))
      : undefined;
  const encryption = matrix.encryption ?? false;
  return {
    homeserver,
    userId,
    accessToken,
    password,
    register,
    deviceId,
    deviceName,
    initialSyncLimit,
    encryption,
  };
}

export function resolveMatrixConfigForAccount(
  cfg: CoreConfig,
  accountId: string,
  env: NodeJS.ProcessEnv = process.env,
): MatrixResolvedConfig {
  const matrix = cfg.channels?.["matrix-js"] ?? {};
  const account = findAccountConfig(cfg, accountId);

  const accountHomeserver = clean(
    typeof account.homeserver === "string" ? account.homeserver : undefined,
  );
  const accountUserId = clean(typeof account.userId === "string" ? account.userId : undefined);
  const accountAccessToken = clean(
    typeof account.accessToken === "string" ? account.accessToken : undefined,
  );
  const accountPassword = clean(
    typeof account.password === "string" ? account.password : undefined,
  );
  const accountDeviceId = clean(
    typeof account.deviceId === "string" ? account.deviceId : undefined,
  );
  const accountDeviceName = clean(
    typeof account.deviceName === "string" ? account.deviceName : undefined,
  );

  const homeserver = accountHomeserver || clean(matrix.homeserver) || clean(env.MATRIX_HOMESERVER);
  const userId = accountUserId || clean(matrix.userId) || clean(env.MATRIX_USER_ID);
  const accessToken =
    accountAccessToken || clean(matrix.accessToken) || clean(env.MATRIX_ACCESS_TOKEN) || undefined;
  const password =
    accountPassword || clean(matrix.password) || clean(env.MATRIX_PASSWORD) || undefined;
  const register =
    parseOptionalBoolean(account.register) ??
    parseOptionalBoolean(matrix.register) ??
    parseOptionalBoolean(env.MATRIX_REGISTER) ??
    false;
  const deviceId =
    accountDeviceId || clean(matrix.deviceId) || clean(env.MATRIX_DEVICE_ID) || undefined;
  const deviceName =
    accountDeviceName || clean(matrix.deviceName) || clean(env.MATRIX_DEVICE_NAME) || undefined;

  const accountInitialSyncLimit =
    typeof account.initialSyncLimit === "number"
      ? Math.max(0, Math.floor(account.initialSyncLimit))
      : undefined;
  const initialSyncLimit =
    accountInitialSyncLimit ??
    (typeof matrix.initialSyncLimit === "number"
      ? Math.max(0, Math.floor(matrix.initialSyncLimit))
      : undefined);
  const encryption =
    typeof account.encryption === "boolean" ? account.encryption : (matrix.encryption ?? false);

  return {
    homeserver,
    userId,
    accessToken,
    password,
    register,
    deviceId,
    deviceName,
    initialSyncLimit,
    encryption,
  };
}

export async function resolveMatrixAuth(params?: {
  cfg?: CoreConfig;
  env?: NodeJS.ProcessEnv;
  accountId?: string | null;
}): Promise<MatrixAuth> {
  const cfg = params?.cfg ?? (getMatrixRuntime().config.loadConfig() as CoreConfig);
  const env = params?.env ?? process.env;
  const accountId = params?.accountId;
  const resolved = accountId
    ? resolveMatrixConfigForAccount(cfg, accountId, env)
    : resolveMatrixConfig(cfg, env);
  const registerFromConfig = resolved.register === true;
  if (!resolved.homeserver) {
    throw new Error("Matrix homeserver is required (matrix-js.homeserver)");
  }

  const {
    loadMatrixCredentials,
    saveMatrixCredentials,
    credentialsMatchConfig,
    touchMatrixCredentials,
  } = await import("../credentials.js");

  const cached = loadMatrixCredentials(env, accountId);
  const cachedCredentials =
    cached &&
    credentialsMatchConfig(cached, {
      homeserver: resolved.homeserver,
      userId: resolved.userId || "",
    })
      ? cached
      : null;

  if (registerFromConfig) {
    if (!resolved.userId) {
      throw new Error("Matrix userId is required when matrix-js.register=true");
    }
    if (!resolved.password) {
      throw new Error("Matrix password is required when matrix-js.register=true");
    }
    await prepareMatrixRegisterMode({
      cfg,
      homeserver: resolved.homeserver,
      userId: resolved.userId,
      env,
    });
  }

  // If we have an access token, we can fetch userId via whoami if not provided
  if (resolved.accessToken && !registerFromConfig) {
    let userId = resolved.userId;
    const hasMatchingCachedToken = cachedCredentials?.accessToken === resolved.accessToken;
    let knownDeviceId = hasMatchingCachedToken
      ? cachedCredentials?.deviceId || resolved.deviceId
      : resolved.deviceId;

    if (!userId || !knownDeviceId) {
      // Fetch whoami when we need to resolve userId and/or deviceId from token auth.
      ensureMatrixSdkLoggingConfigured();
      const tempClient = new MatrixClient(resolved.homeserver, resolved.accessToken);
      const whoami = (await tempClient.doRequest("GET", "/_matrix/client/v3/account/whoami")) as {
        user_id?: string;
        device_id?: string;
      };
      if (!userId) {
        const fetchedUserId = whoami.user_id?.trim();
        if (!fetchedUserId) {
          throw new Error("Matrix whoami did not return user_id");
        }
        userId = fetchedUserId;
      }
      if (!knownDeviceId) {
        knownDeviceId = whoami.device_id?.trim() || resolved.deviceId;
      }
    }

    const shouldRefreshCachedCredentials =
      !cachedCredentials ||
      !hasMatchingCachedToken ||
      cachedCredentials.userId !== userId ||
      (cachedCredentials.deviceId || undefined) !== knownDeviceId;
    if (shouldRefreshCachedCredentials) {
      saveMatrixCredentials(
        {
          homeserver: resolved.homeserver,
          userId,
          accessToken: resolved.accessToken,
          deviceId: knownDeviceId,
        },
        env,
        accountId,
      );
    } else if (hasMatchingCachedToken) {
      touchMatrixCredentials(env, accountId);
    }
    return {
      homeserver: resolved.homeserver,
      userId,
      accessToken: resolved.accessToken,
      password: resolved.password,
      deviceId: knownDeviceId,
      deviceName: resolved.deviceName,
      initialSyncLimit: resolved.initialSyncLimit,
      encryption: resolved.encryption,
    };
  }

  if (cachedCredentials && !registerFromConfig) {
    touchMatrixCredentials(env, accountId);
    return {
      homeserver: cachedCredentials.homeserver,
      userId: cachedCredentials.userId,
      accessToken: cachedCredentials.accessToken,
      password: resolved.password,
      deviceId: cachedCredentials.deviceId || resolved.deviceId,
      deviceName: resolved.deviceName,
      initialSyncLimit: resolved.initialSyncLimit,
      encryption: resolved.encryption,
    };
  }

  if (!resolved.userId) {
    throw new Error(
      "Matrix userId is required when no access token is configured (matrix-js.userId)",
    );
  }

  if (!resolved.password) {
    throw new Error(
      "Matrix password is required when no access token is configured (matrix-js.password)",
    );
  }

  // Login with password using the same hardened request path as other Matrix HTTP calls.
  ensureMatrixSdkLoggingConfigured();
  const loginClient = new MatrixClient(resolved.homeserver, "");
  let login: {
    access_token?: string;
    user_id?: string;
    device_id?: string;
  };
  try {
    login = (await loginClient.doRequest("POST", "/_matrix/client/v3/login", undefined, {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: resolved.userId },
      password: resolved.password,
      device_id: resolved.deviceId,
      initial_device_display_name: resolved.deviceName ?? "OpenClaw Gateway",
    })) as {
      access_token?: string;
      user_id?: string;
      device_id?: string;
    };
  } catch (loginErr) {
    if (!resolved.register) {
      throw loginErr;
    }
    try {
      login = await registerMatrixPasswordAccount({
        homeserver: resolved.homeserver,
        userId: resolved.userId,
        password: resolved.password,
        deviceId: resolved.deviceId,
        deviceName: resolved.deviceName,
      });
    } catch (registerErr) {
      const loginMessage = loginErr instanceof Error ? loginErr.message : String(loginErr);
      const registerMessage =
        registerErr instanceof Error ? registerErr.message : String(registerErr);
      throw new Error(
        `Matrix login failed (${loginMessage}) and account registration failed (${registerMessage})`,
      );
    }
  }

  const accessToken = login.access_token?.trim();
  if (!accessToken) {
    throw new Error("Matrix login/registration did not return an access token");
  }

  const auth: MatrixAuth = {
    homeserver: resolved.homeserver,
    userId: login.user_id ?? resolved.userId,
    accessToken,
    password: resolved.password,
    deviceId: login.device_id ?? resolved.deviceId,
    deviceName: resolved.deviceName,
    initialSyncLimit: resolved.initialSyncLimit,
    encryption: resolved.encryption,
  };

  saveMatrixCredentials(
    {
      homeserver: auth.homeserver,
      userId: auth.userId,
      accessToken: auth.accessToken,
      deviceId: auth.deviceId,
    },
    env,
    accountId,
  );

  if (registerFromConfig) {
    await finalizeMatrixRegisterConfigAfterSuccess({
      homeserver: auth.homeserver,
      userId: auth.userId,
      deviceId: auth.deviceId,
    });
  }

  return auth;
}
