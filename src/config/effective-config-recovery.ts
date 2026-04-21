import crypto from "node:crypto";
import fs from "node:fs/promises";
import JSON5 from "json5";
import { writeTextAtomic } from "../infra/json-files.js";

export type EffectiveConfigRecoverySnapshot = {
  path: string;
  raw: string;
  hash: string;
};

const LAST_KNOWN_GOOD_SUFFIX = ".last-known-good";

function hashConfigRaw(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function assertValidConfigRaw(raw: string): void {
  JSON5.parse(raw);
}

export function resolveEffectiveConfigLastKnownGoodPath(configPath: string): string {
  return `${configPath}${LAST_KNOWN_GOOD_SUFFIX}`;
}

export async function persistEffectiveConfigLastKnownGood(snapshot: {
  path: string;
  raw: string | null;
  hash?: string;
}): Promise<EffectiveConfigRecoverySnapshot | null> {
  if (typeof snapshot.raw !== "string") {
    return null;
  }
  assertValidConfigRaw(snapshot.raw);
  const next = {
    path: resolveEffectiveConfigLastKnownGoodPath(snapshot.path),
    raw: snapshot.raw,
    hash: snapshot.hash?.trim() || hashConfigRaw(snapshot.raw),
  };
  await writeTextAtomic(next.path, next.raw, { mode: 0o600 });
  return next;
}

export async function readEffectiveConfigLastKnownGood(
  configPath: string,
): Promise<EffectiveConfigRecoverySnapshot | null> {
  const filePath = resolveEffectiveConfigLastKnownGoodPath(configPath);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    assertValidConfigRaw(raw);
    return {
      path: filePath,
      raw,
      hash: hashConfigRaw(raw),
    };
  } catch {
    return null;
  }
}

export async function restoreEffectiveConfigLastKnownGood(
  configPath: string,
): Promise<EffectiveConfigRecoverySnapshot | null> {
  const snapshot = await readEffectiveConfigLastKnownGood(configPath);
  if (!snapshot) {
    return null;
  }
  await writeTextAtomic(configPath, snapshot.raw, { mode: 0o600 });
  return snapshot;
}
