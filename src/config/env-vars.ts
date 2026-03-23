import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  isDangerousHostEnvOverrideVarName,
  isDangerousHostEnvVarName,
  normalizeEnvVarKey,
} from "../infra/host-env-security.js";
import { containsEnvVarReference } from "./env-substitution.js";
import { resolveStateDir } from "./paths.js";
import type { OpenClawConfig } from "./types.js";

function isBlockedConfigEnvVar(key: string): boolean {
  return isDangerousHostEnvVarName(key) || isDangerousHostEnvOverrideVarName(key);
}

function collectConfigEnvVarsByTarget(cfg?: OpenClawConfig): Record<string, string> {
  const envConfig = cfg?.env;
  if (!envConfig) {
    return {};
  }

  const entries: Record<string, string> = {};

  if (envConfig.vars) {
    for (const [rawKey, value] of Object.entries(envConfig.vars)) {
      if (!value) {
        continue;
      }
      const key = normalizeEnvVarKey(rawKey, { portable: true });
      if (!key) {
        continue;
      }
      if (isBlockedConfigEnvVar(key)) {
        continue;
      }
      entries[key] = value;
    }
  }

  for (const [rawKey, value] of Object.entries(envConfig)) {
    if (rawKey === "shellEnv" || rawKey === "vars") {
      continue;
    }
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const key = normalizeEnvVarKey(rawKey, { portable: true });
    if (!key) {
      continue;
    }
    if (isBlockedConfigEnvVar(key)) {
      continue;
    }
    entries[key] = value;
  }

  return entries;
}

/**
 * Read and parse `~/.openclaw/.env` (or `$OPENCLAW_STATE_DIR/.env`), returning
 * a filtered record of key-value pairs suitable for embedding in a service
 * environment (LaunchAgent plist, systemd unit, Scheduled Task).
 *
 * Security: dangerous host env vars (NODE_OPTIONS, LD_PRELOAD, etc.) are
 * dropped, matching the same policy applied to config env vars.
 */
export function readStateDirDotEnvVars(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const stateDir = resolveStateDir(env as NodeJS.ProcessEnv);
  const dotEnvPath = path.join(stateDir, ".env");

  let content: string;
  try {
    content = fs.readFileSync(dotEnvPath, "utf8");
  } catch {
    return {};
  }

  const parsed = dotenv.parse(content);
  const entries: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(parsed)) {
    if (!value?.trim()) {
      continue;
    }
    const key = normalizeEnvVarKey(rawKey, { portable: true });
    if (!key) {
      continue;
    }
    if (isBlockedConfigEnvVar(key)) {
      continue;
    }
    entries[key] = value;
  }
  return entries;
}

export function collectConfigRuntimeEnvVars(cfg?: OpenClawConfig): Record<string, string> {
  return collectConfigEnvVarsByTarget(cfg);
}

export function collectConfigServiceEnvVars(cfg?: OpenClawConfig): Record<string, string> {
  return collectConfigEnvVarsByTarget(cfg);
}

/** @deprecated Use `collectConfigRuntimeEnvVars` or `collectConfigServiceEnvVars`. */
export function collectConfigEnvVars(cfg?: OpenClawConfig): Record<string, string> {
  return collectConfigRuntimeEnvVars(cfg);
}

export function createConfigRuntimeEnv(
  cfg: OpenClawConfig,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  applyConfigEnvVars(cfg, env);
  return env;
}

export function applyConfigEnvVars(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const entries = collectConfigRuntimeEnvVars(cfg);
  for (const [key, value] of Object.entries(entries)) {
    if (env[key]?.trim()) {
      continue;
    }
    // Skip values containing unresolved ${VAR} references — applyConfigEnvVars runs
    // before env substitution, so these would pollute process.env with literal placeholders
    // (e.g. process.env.OPENCLAW_GATEWAY_TOKEN = "${VAULT_TOKEN}") which downstream auth
    // resolution would accept as valid credentials.
    if (containsEnvVarReference(value)) {
      continue;
    }
    env[key] = value;
  }
}
