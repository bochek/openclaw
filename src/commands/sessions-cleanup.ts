import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import {
  capEntryCount,
  enforceSessionDiskBudget,
  loadSessionStore,
  pruneStaleEntries,
  resolveMaintenanceConfig,
  resolveStorePath,
  updateSessionStore,
} from "../config/sessions.js";
import type { RuntimeEnv } from "../runtime.js";

export type SessionsCleanupOptions = {
  store?: string;
  dryRun?: boolean;
  enforce?: boolean;
  activeKey?: string;
  json?: boolean;
};

export async function sessionsCleanupCommand(opts: SessionsCleanupOptions, runtime: RuntimeEnv) {
  const cfg = loadConfig();
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const storePath = resolveStorePath(opts.store ?? cfg.session?.store, { agentId: defaultAgentId });
  const maintenance = resolveMaintenanceConfig();
  const effectiveMode = opts.enforce ? "enforce" : maintenance.mode;

  const beforeStore = loadSessionStore(storePath, { skipCache: true });
  const previewStore = structuredClone(beforeStore);
  const pruned = pruneStaleEntries(previewStore, maintenance.pruneAfterMs, { log: false });
  const capped = capEntryCount(previewStore, maintenance.maxEntries, { log: false });
  const diskBudget = await enforceSessionDiskBudget({
    store: previewStore,
    storePath,
    activeSessionKey: opts.activeKey,
    maintenance,
    warnOnly: false,
    dryRun: true,
  });
  const beforeCount = Object.keys(beforeStore).length;
  const afterPreviewCount = Object.keys(previewStore).length;
  const wouldMutate =
    pruned > 0 ||
    capped > 0 ||
    Boolean((diskBudget?.removedEntries ?? 0) > 0 || (diskBudget?.removedFiles ?? 0) > 0);

  const summary = {
    storePath,
    mode: effectiveMode,
    dryRun: Boolean(opts.dryRun),
    beforeCount,
    afterCount: afterPreviewCount,
    pruned,
    capped,
    diskBudget,
    wouldMutate,
  };

  if (opts.json && opts.dryRun) {
    runtime.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (!opts.json) {
    runtime.log(`Session store: ${storePath}`);
    runtime.log(`Maintenance mode: ${effectiveMode}`);
    runtime.log(`Entries: ${beforeCount} -> ${afterPreviewCount}`);
    runtime.log(`Would prune stale: ${pruned}`);
    runtime.log(`Would cap overflow: ${capped}`);
    if (diskBudget) {
      runtime.log(
        `Would enforce disk budget: ${diskBudget.totalBytesBefore} -> ${diskBudget.totalBytesAfter} bytes (files ${diskBudget.removedFiles}, entries ${diskBudget.removedEntries})`,
      );
    }
  }

  if (opts.dryRun) {
    return;
  }

  await updateSessionStore(
    storePath,
    async () => {
      // Maintenance runs in saveSessionStoreUnlocked(); no direct store mutation needed here.
    },
    {
      activeSessionKey: opts.activeKey,
      maintenanceOverride: {
        mode: effectiveMode,
      },
    },
  );

  const afterStore = loadSessionStore(storePath, { skipCache: true });
  const appliedCount = Object.keys(afterStore).length;
  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          ...summary,
          applied: true,
          appliedCount,
        },
        null,
        2,
      ),
    );
    return;
  }

  runtime.log(`Applied maintenance. Current entries: ${appliedCount}`);
}
