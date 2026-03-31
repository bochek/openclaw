import { confirm, isCancel } from "@clack/prompts";
import { readConfigFileSnapshot } from "../../config/config.js";
import {
  formatUpdateChannelLabel,
  normalizeUpdateChannel,
  resolveEffectiveUpdateChannel,
} from "../../infra/update-channels.js";
import { checkUpdateStatus } from "../../infra/update-check.js";
import { defaultRuntime } from "../../runtime.js";
import { selectStyled } from "../../terminal/prompt-select-styled.js";
import { stylePromptMessage } from "../../terminal/prompt-style.js";
import { theme } from "../../terminal/theme.js";
import { pathExists } from "../../utils.js";
import {
  isEmptyDir,
  isGitCheckout,
  parseTimeoutMsOrExit,
  resolveGitInstallDir,
  resolveUpdateRoot,
  type UpdateWizardOptions,
} from "./shared.js";
import { updateCommand } from "./update-command.js";

type UpdateWizardDeps = {
  defaultRuntime: typeof defaultRuntime;
  confirm: typeof confirm;
  isCancel: typeof isCancel;
  selectStyled: typeof selectStyled;
  updateCommand: typeof updateCommand;
};

const defaultUpdateWizardDeps: UpdateWizardDeps = {
  defaultRuntime,
  confirm,
  isCancel,
  selectStyled,
  updateCommand,
};

let updateWizardDeps: UpdateWizardDeps = defaultUpdateWizardDeps;

export async function updateWizardCommand(opts: UpdateWizardOptions = {}): Promise<void> {
  if (!process.stdin.isTTY) {
    updateWizardDeps.defaultRuntime.error(
      "Update wizard requires a TTY. Use `openclaw update --channel <stable|beta|dev>` instead.",
    );
    updateWizardDeps.defaultRuntime.exit(1);
    return;
  }

  const timeoutMs = parseTimeoutMsOrExit(opts.timeout);
  if (timeoutMs === null) {
    return;
  }

  const root = await resolveUpdateRoot();
  const [updateStatus, configSnapshot] = await Promise.all([
    checkUpdateStatus({
      root,
      timeoutMs: timeoutMs ?? 3500,
      fetchGit: false,
      includeRegistry: false,
    }),
    readConfigFileSnapshot(),
  ]);

  const configChannel = configSnapshot.valid
    ? normalizeUpdateChannel(configSnapshot.config.update?.channel)
    : null;
  const channelInfo = resolveEffectiveUpdateChannel({
    configChannel,
    installKind: updateStatus.installKind,
    git: updateStatus.git
      ? { tag: updateStatus.git.tag, branch: updateStatus.git.branch }
      : undefined,
  });
  const channelLabel = formatUpdateChannelLabel({
    channel: channelInfo.channel,
    source: channelInfo.source,
    gitTag: updateStatus.git?.tag ?? null,
    gitBranch: updateStatus.git?.branch ?? null,
  });

  const pickedChannel = await updateWizardDeps.selectStyled({
    message: "Update channel",
    options: [
      {
        value: "keep",
        label: `Keep current (${channelInfo.channel})`,
        hint: channelLabel,
      },
      {
        value: "stable",
        label: "Stable",
        hint: "Tagged releases (npm latest)",
      },
      {
        value: "beta",
        label: "Beta",
        hint: "Prereleases (npm beta)",
      },
      {
        value: "dev",
        label: "Dev",
        hint: "Git main",
      },
    ],
    initialValue: "keep",
  });

  if (updateWizardDeps.isCancel(pickedChannel)) {
    updateWizardDeps.defaultRuntime.log(theme.muted("Update cancelled."));
    updateWizardDeps.defaultRuntime.exit(0);
    return;
  }

  const requestedChannel = pickedChannel === "keep" ? null : pickedChannel;

  if (requestedChannel === "dev" && updateStatus.installKind !== "git") {
    const gitDir = resolveGitInstallDir();
    const hasGit = await isGitCheckout(gitDir);
    if (!hasGit) {
      const dirExists = await pathExists(gitDir);
      if (dirExists) {
        const empty = await isEmptyDir(gitDir);
        if (!empty) {
          updateWizardDeps.defaultRuntime.error(
            `OPENCLAW_GIT_DIR points at a non-git directory: ${gitDir}. Set OPENCLAW_GIT_DIR to an empty folder or an openclaw checkout.`,
          );
          updateWizardDeps.defaultRuntime.exit(1);
          return;
        }
      }

      const ok = await updateWizardDeps.confirm({
        message: stylePromptMessage(
          `Create a git checkout at ${gitDir}? (override via OPENCLAW_GIT_DIR)`,
        ),
        initialValue: true,
      });
      if (updateWizardDeps.isCancel(ok) || !ok) {
        updateWizardDeps.defaultRuntime.log(theme.muted("Update cancelled."));
        updateWizardDeps.defaultRuntime.exit(0);
        return;
      }
    }
  }

  const restart = await updateWizardDeps.confirm({
    message: stylePromptMessage("Restart the gateway service after update?"),
    initialValue: true,
  });
  if (updateWizardDeps.isCancel(restart)) {
    updateWizardDeps.defaultRuntime.log(theme.muted("Update cancelled."));
    updateWizardDeps.defaultRuntime.exit(0);
    return;
  }

  try {
    await updateWizardDeps.updateCommand({
      channel: requestedChannel ?? undefined,
      restart: Boolean(restart),
      timeout: opts.timeout,
    });
  } catch (err) {
    updateWizardDeps.defaultRuntime.error(String(err));
    updateWizardDeps.defaultRuntime.exit(1);
  }
}

export const __testing = {
  setDepsForTest(next: Partial<UpdateWizardDeps>) {
    updateWizardDeps = { ...updateWizardDeps, ...next };
  },
  resetDepsForTest() {
    updateWizardDeps = defaultUpdateWizardDeps;
  },
};
