import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { CoreConfig, MatrixAccountConfig, MatrixConfig } from "./types.js";

type LegacyAccountField =
  | "homeserver"
  | "userId"
  | "accessToken"
  | "password"
  | "deviceId"
  | "deviceName"
  | "initialSyncLimit";

const LEGACY_ACCOUNT_FIELDS: ReadonlyArray<LegacyAccountField> = [
  "homeserver",
  "userId",
  "accessToken",
  "password",
  "deviceId",
  "deviceName",
  "initialSyncLimit",
];

export function migrateMatrixLegacyCredentialsToDefaultAccount(cfg: CoreConfig): CoreConfig {
  const matrix = cfg.channels?.["matrix-js"];
  if (!matrix) {
    return cfg;
  }

  const defaultAccount = {
    ...(matrix.accounts?.[DEFAULT_ACCOUNT_ID] ?? {}),
  } as MatrixAccountConfig;
  let changed = false;

  for (const field of LEGACY_ACCOUNT_FIELDS) {
    const legacyValue = matrix[field] as MatrixAccountConfig[LegacyAccountField] | undefined;
    if (legacyValue === undefined) {
      continue;
    }
    if (defaultAccount[field] === undefined) {
      (
        defaultAccount as Record<
          LegacyAccountField,
          MatrixAccountConfig[LegacyAccountField] | undefined
        >
      )[field] = legacyValue;
    }
    changed = true;
  }

  if (!changed) {
    return cfg;
  }

  const nextMatrix = { ...matrix } as MatrixConfig;
  for (const field of LEGACY_ACCOUNT_FIELDS) {
    delete nextMatrix[field];
  }
  nextMatrix.accounts = {
    ...matrix.accounts,
    [DEFAULT_ACCOUNT_ID]: defaultAccount,
  };

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      "matrix-js": nextMatrix,
    },
  };
}
