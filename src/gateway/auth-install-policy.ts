import type { OpenClawConfig } from "../config/config.js";
import { collectConfigServiceEnvVars, readStateDirDotEnvVars } from "../config/env-vars.js";
import { hasConfiguredSecretInput } from "../config/types.secrets.js";

export function shouldRequireGatewayTokenForInstall(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv,
): boolean {
  const mode = cfg.gateway?.auth?.mode;
  if (mode === "token") {
    return true;
  }
  if (mode === "password" || mode === "none" || mode === "trusted-proxy") {
    return false;
  }

  const hasConfiguredPassword = hasConfiguredSecretInput(
    cfg.gateway?.auth?.password,
    cfg.secrets?.defaults,
  );
  if (hasConfiguredPassword) {
    return false;
  }

  // Service install should only infer password mode from durable sources that
  // survive outside the invoking shell.
  const durableServiceEnv = {
    ...readStateDirDotEnvVars(env),
    ...collectConfigServiceEnvVars(cfg),
  };
  const hasConfiguredPasswordEnvCandidate = Boolean(
    durableServiceEnv.OPENCLAW_GATEWAY_PASSWORD?.trim() ||
    durableServiceEnv.CLAWDBOT_GATEWAY_PASSWORD?.trim(),
  );
  if (hasConfiguredPasswordEnvCandidate) {
    return false;
  }

  return true;
}
