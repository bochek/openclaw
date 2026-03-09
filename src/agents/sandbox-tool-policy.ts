import type { SandboxToolPolicy } from "./sandbox/types.js";
import { mergeAlsoAllowIntoAllowlist } from "./tool-policy-also-allow.js";

type SandboxToolPolicyConfig = {
  allow?: string[];
  alsoAllow?: string[];
  deny?: string[];
};

export function pickSandboxToolPolicy(
  config?: SandboxToolPolicyConfig,
): SandboxToolPolicy | undefined {
  if (!config) {
    return undefined;
  }
  const allow = mergeAlsoAllowIntoAllowlist({
    allow: Array.isArray(config.allow) ? config.allow : undefined,
    alsoAllow: config.alsoAllow,
    assumeAllowAll: true,
  });
  const deny = Array.isArray(config.deny) ? config.deny : undefined;
  if (!allow && !deny) {
    return undefined;
  }
  return { allow, deny };
}
