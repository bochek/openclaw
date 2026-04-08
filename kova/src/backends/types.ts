import type { KovaRunArtifact } from "../contracts/run-artifact.js";

export type KovaRunTarget = "qa" | "character-eval" | "parallels";
export type KovaBackendId = "host" | "multipass" | "parallels";
export const kovaRunTargets = [
  "qa",
  "character-eval",
  "parallels",
] as const satisfies readonly KovaRunTarget[];

export type KovaBackendRunSelection = {
  repoRoot: string;
  runId: string;
  target: KovaRunTarget;
  backend?: KovaBackendId;
  providerMode?: "mock-openai" | "live-frontier";
  scenarioIds?: string[];
  modelRefs?: string[];
  axes?: Record<string, string>;
};

export type KovaBackend = {
  id: KovaBackendId;
  title: string;
  kind: string;
  runner: "host" | "vm" | "docker" | "live";
  binary?: string;
  supportsTarget(target: string): target is KovaRunTarget;
  run(selection: KovaBackendRunSelection): Promise<KovaRunArtifact>;
};
