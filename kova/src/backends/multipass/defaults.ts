export const MULTIPASS_MOUNTED_REPO_PATH = "/workspace/openclaw-host";
export const MULTIPASS_IMAGE = "lts";

export const multipassDefaultResourceProfile = {
  profile: "qa-core",
  cpus: 2,
  memory: "4G",
  disk: "24G",
} as const;

export const multipassDefaultQaScenarioIds = [
  "channel-chat-baseline",
  "dm-chat-baseline",
  "thread-follow-up",
  "model-switch-follow-up",
] as const;
