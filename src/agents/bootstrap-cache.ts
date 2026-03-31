import { loadWorkspaceBootstrapFiles, type WorkspaceBootstrapFile } from "./workspace.js";

const cache = new Map<string, WorkspaceBootstrapFile[]>();

type BootstrapCacheDeps = {
  loadWorkspaceBootstrapFiles: typeof loadWorkspaceBootstrapFiles;
};

const defaultBootstrapCacheDeps: BootstrapCacheDeps = {
  loadWorkspaceBootstrapFiles,
};

let bootstrapCacheDeps: BootstrapCacheDeps = defaultBootstrapCacheDeps;

export async function getOrLoadBootstrapFiles(params: {
  workspaceDir: string;
  sessionKey: string;
}): Promise<WorkspaceBootstrapFile[]> {
  const existing = cache.get(params.sessionKey);
  if (existing) {
    return existing;
  }

  const files = await bootstrapCacheDeps.loadWorkspaceBootstrapFiles(params.workspaceDir);
  cache.set(params.sessionKey, files);
  return files;
}

export function clearBootstrapSnapshot(sessionKey: string): void {
  cache.delete(sessionKey);
}

export function clearBootstrapSnapshotOnSessionRollover(params: {
  sessionKey?: string;
  previousSessionId?: string;
}): void {
  if (!params.sessionKey || !params.previousSessionId) {
    return;
  }

  clearBootstrapSnapshot(params.sessionKey);
}

export function clearAllBootstrapSnapshots(): void {
  cache.clear();
}

export const __testing = {
  setDepsForTest(overrides?: Partial<BootstrapCacheDeps>) {
    bootstrapCacheDeps = overrides
      ? {
          ...defaultBootstrapCacheDeps,
          ...overrides,
        }
      : defaultBootstrapCacheDeps;
  },
};
