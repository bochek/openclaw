import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { readConfigFileSnapshot } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { runNonInteractiveOnboardingLocal } from "./onboard-non-interactive/local.js";
import { runNonInteractiveOnboardingRemote } from "./onboard-non-interactive/remote.js";
import { VALID_TOOLS_PROFILES, type OnboardOptions } from "./onboard-types.js";

export async function runNonInteractiveOnboarding(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const snapshot = await readConfigFileSnapshot();
  if (snapshot.exists && !snapshot.valid) {
    runtime.error(
      `Config invalid. Run \`${formatCliCommand("openclaw doctor")}\` to repair it, then re-run onboarding.`,
    );
    runtime.exit(1);
    return;
  }

  const baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};
  const mode = opts.mode ?? "local";
  if (mode !== "local" && mode !== "remote") {
    runtime.error(`Invalid --mode "${String(mode)}" (use local|remote).`);
    runtime.exit(1);
    return;
  }
  if (mode === "remote" && opts.toolsProfile !== undefined) {
    runtime.error('--tools-profile is only supported when --mode is "local".');
    runtime.exit(1);
    return;
  }
  if (opts.toolsProfile !== undefined && !VALID_TOOLS_PROFILES.has(opts.toolsProfile)) {
    runtime.error('Invalid --tools-profile. Use "minimal", "coding", "messaging", or "full".');
    runtime.exit(1);
    return;
  }

  if (mode === "remote") {
    await runNonInteractiveOnboardingRemote({ opts, runtime, baseConfig });
    return;
  }

  await runNonInteractiveOnboardingLocal({ opts, runtime, baseConfig });
}
