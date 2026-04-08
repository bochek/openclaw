import type { KovaRunArtifact } from "../contracts/run-artifact.js";

export type KovaRunTarget = "qa";

export type KovaBackendRunSelection = {
  repoRoot: string;
  runId: string;
  target: KovaRunTarget;
  providerMode?: "mock-openai" | "live-frontier";
  scenarioIds?: string[];
};

export type KovaBackend = {
  id: string;
  supportsTarget(target: string): target is KovaRunTarget;
  run(selection: KovaBackendRunSelection): Promise<KovaRunArtifact>;
};
