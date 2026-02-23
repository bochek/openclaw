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
import { isRich, theme } from "../terminal/theme.js";
import {
  formatSessionAgeCell,
  formatSessionFlagsCell,
  formatSessionKeyCell,
  formatSessionModelCell,
  resolveSessionDisplayDefaults,
  resolveSessionDisplayModel,
  SESSION_AGE_PAD,
  SESSION_KEY_PAD,
  SESSION_MODEL_PAD,
  toSessionDisplayRows,
} from "./sessions-table.js";

export type SessionsCleanupOptions = {
  store?: string;
  dryRun?: boolean;
  enforce?: boolean;
  activeKey?: string;
  json?: boolean;
};

type SessionCleanupAction = "keep" | "prune-stale" | "cap-overflow" | "evict-budget";

const ACTION_PAD = 12;

function resolveSessionCleanupAction(params: {
  key: string;
  staleKeys: Set<string>;
  cappedKeys: Set<string>;
  budgetEvictedKeys: Set<string>;
}): SessionCleanupAction {
  if (params.staleKeys.has(params.key)) {
    return "prune-stale";
  }
  if (params.cappedKeys.has(params.key)) {
    return "cap-overflow";
  }
  if (params.budgetEvictedKeys.has(params.key)) {
    return "evict-budget";
  }
  return "keep";
}

function formatCleanupActionCell(action: SessionCleanupAction, rich: boolean): string {
  const label = action.padEnd(ACTION_PAD);
  if (!rich) {
    return label;
  }
  if (action === "keep") {
    return theme.muted(label);
  }
  if (action === "prune-stale") {
    return theme.warn(label);
  }
  if (action === "cap-overflow") {
    return theme.accentBright(label);
  }
  return theme.error(label);
}

export async function sessionsCleanupCommand(opts: SessionsCleanupOptions, runtime: RuntimeEnv) {
  const cfg = loadConfig();
  const displayDefaults = resolveSessionDisplayDefaults(cfg);
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const storePath = resolveStorePath(opts.store ?? cfg.session?.store, { agentId: defaultAgentId });
  const maintenance = resolveMaintenanceConfig();
  const effectiveMode = opts.enforce ? "enforce" : maintenance.mode;

  const beforeStore = loadSessionStore(storePath, { skipCache: true });
  const previewStore = structuredClone(beforeStore);
  const staleKeys = new Set<string>();
  const cappedKeys = new Set<string>();
  const pruned = pruneStaleEntries(previewStore, maintenance.pruneAfterMs, {
    log: false,
    onPruned: ({ key }) => {
      staleKeys.add(key);
    },
  });
  const capped = capEntryCount(previewStore, maintenance.maxEntries, {
    log: false,
    onCapped: ({ key }) => {
      cappedKeys.add(key);
    },
  });
  const beforeBudgetStore = structuredClone(previewStore);
  const diskBudget = await enforceSessionDiskBudget({
    store: previewStore,
    storePath,
    activeSessionKey: opts.activeKey,
    maintenance,
    warnOnly: false,
    dryRun: true,
  });
  const budgetEvictedKeys = new Set<string>();
  for (const key of Object.keys(beforeBudgetStore)) {
    if (Object.hasOwn(previewStore, key)) {
      continue;
    }
    budgetEvictedKeys.add(key);
  }
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

  const actionRows = toSessionDisplayRows(beforeStore).map((row) => ({
    row,
    action: resolveSessionCleanupAction({
      key: row.key,
      staleKeys,
      cappedKeys,
      budgetEvictedKeys,
    }),
  }));

  if (opts.json && opts.dryRun) {
    runtime.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (!opts.json) {
    runtime.log(`Session store: ${storePath}`);
    runtime.log(`Maintenance mode: ${effectiveMode}`);
    runtime.log(
      `Entries: ${beforeCount} -> ${afterPreviewCount} (remove ${beforeCount - afterPreviewCount})`,
    );
    runtime.log(`Would prune stale: ${pruned}`);
    runtime.log(`Would cap overflow: ${capped}`);
    if (diskBudget) {
      runtime.log(
        `Would enforce disk budget: ${diskBudget.totalBytesBefore} -> ${diskBudget.totalBytesAfter} bytes (files ${diskBudget.removedFiles}, entries ${diskBudget.removedEntries})`,
      );
    }
    if (opts.dryRun && actionRows.length > 0) {
      const rich = isRich();
      runtime.log("");
      runtime.log("Planned session actions:");
      const header = [
        "Action".padEnd(ACTION_PAD),
        "Key".padEnd(SESSION_KEY_PAD),
        "Age".padEnd(SESSION_AGE_PAD),
        "Model".padEnd(SESSION_MODEL_PAD),
        "Flags",
      ].join(" ");
      runtime.log(rich ? theme.heading(header) : header);
      for (const actionRow of actionRows) {
        const model = resolveSessionDisplayModel(cfg, actionRow.row, displayDefaults);
        const line = [
          formatCleanupActionCell(actionRow.action, rich),
          formatSessionKeyCell(actionRow.row.key, rich),
          formatSessionAgeCell(actionRow.row.updatedAt, rich),
          formatSessionModelCell(model, rich),
          formatSessionFlagsCell(actionRow.row, rich),
        ].join(" ");
        runtime.log(line.trimEnd());
      }
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
