import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { lookupContextTokens } from "../agents/context.js";
import { DEFAULT_CONTEXT_TOKENS } from "../agents/defaults.js";
import { loadConfig } from "../config/config.js";
import {
  loadSessionStore,
  resolveFreshSessionTotalTokens,
  resolveStorePath,
} from "../config/sessions.js";
import { classifySessionKey } from "../gateway/session-utils.js";
import { info } from "../globals.js";
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
  type SessionDisplayRow,
  toSessionDisplayRows,
} from "./sessions-table.js";

type SessionRow = SessionDisplayRow & {
  kind: "direct" | "group" | "global" | "unknown";
};

const KIND_PAD = 6;
const TOKENS_PAD = 20;

const formatKTokens = (value: number) => `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;

const colorByPct = (label: string, pct: number | null, rich: boolean) => {
  if (!rich || pct === null) {
    return label;
  }
  if (pct >= 95) {
    return theme.error(label);
  }
  if (pct >= 80) {
    return theme.warn(label);
  }
  if (pct >= 60) {
    return theme.success(label);
  }
  return theme.muted(label);
};

const formatTokensCell = (
  total: number | undefined,
  contextTokens: number | null,
  rich: boolean,
) => {
  if (total === undefined) {
    const ctxLabel = contextTokens ? formatKTokens(contextTokens) : "?";
    const label = `unknown/${ctxLabel} (?%)`;
    return rich ? theme.muted(label.padEnd(TOKENS_PAD)) : label.padEnd(TOKENS_PAD);
  }
  const totalLabel = formatKTokens(total);
  const ctxLabel = contextTokens ? formatKTokens(contextTokens) : "?";
  const pct = contextTokens ? Math.min(999, Math.round((total / contextTokens) * 100)) : null;
  const label = `${totalLabel}/${ctxLabel} (${pct ?? "?"}%)`;
  const padded = label.padEnd(TOKENS_PAD);
  return colorByPct(padded, pct, rich);
};

const formatKindCell = (kind: SessionRow["kind"], rich: boolean) => {
  const label = kind.padEnd(KIND_PAD);
  if (!rich) {
    return label;
  }
  if (kind === "group") {
    return theme.accentBright(label);
  }
  if (kind === "global") {
    return theme.warn(label);
  }
  if (kind === "direct") {
    return theme.accent(label);
  }
  return theme.muted(label);
};

export async function sessionsCommand(
  opts: { json?: boolean; store?: string; active?: string },
  runtime: RuntimeEnv,
) {
  const cfg = loadConfig();
  const displayDefaults = resolveSessionDisplayDefaults(cfg);
  const configContextTokens =
    cfg.agents?.defaults?.contextTokens ??
    lookupContextTokens(displayDefaults.model) ??
    DEFAULT_CONTEXT_TOKENS;
  const configModel = displayDefaults.model;
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const storePath = resolveStorePath(opts.store ?? cfg.session?.store, { agentId: defaultAgentId });
  const store = loadSessionStore(storePath);

  let activeMinutes: number | undefined;
  if (opts.active !== undefined) {
    const parsed = Number.parseInt(String(opts.active), 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      runtime.error("--active must be a positive integer (minutes)");
      runtime.exit(1);
      return;
    }
    activeMinutes = parsed;
  }

  const rows = toSessionDisplayRows(store)
    .map((row) => ({
      ...row,
      kind: classifySessionKey(row.key, store[row.key]),
    }))
    .filter((row) => {
      if (activeMinutes === undefined) {
        return true;
      }
      if (!row.updatedAt) {
        return false;
      }
      return Date.now() - row.updatedAt <= activeMinutes * 60_000;
    });

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          path: storePath,
          count: rows.length,
          activeMinutes: activeMinutes ?? null,
          sessions: rows.map((r) => {
            const model = resolveSessionDisplayModel(cfg, r, displayDefaults);
            return {
              ...r,
              totalTokens: resolveFreshSessionTotalTokens(r) ?? null,
              totalTokensFresh:
                typeof r.totalTokens === "number" ? r.totalTokensFresh !== false : false,
              contextTokens:
                r.contextTokens ?? lookupContextTokens(model) ?? configContextTokens ?? null,
              model,
            };
          }),
        },
        null,
        2,
      ),
    );
    return;
  }

  runtime.log(info(`Session store: ${storePath}`));
  runtime.log(info(`Sessions listed: ${rows.length}`));
  if (activeMinutes) {
    runtime.log(info(`Filtered to last ${activeMinutes} minute(s)`));
  }
  if (rows.length === 0) {
    runtime.log("No sessions found.");
    return;
  }

  const rich = isRich();
  const header = [
    "Kind".padEnd(KIND_PAD),
    "Key".padEnd(SESSION_KEY_PAD),
    "Age".padEnd(SESSION_AGE_PAD),
    "Model".padEnd(SESSION_MODEL_PAD),
    "Tokens (ctx %)".padEnd(TOKENS_PAD),
    "Flags",
  ].join(" ");

  runtime.log(rich ? theme.heading(header) : header);

  for (const row of rows) {
    const model = resolveSessionDisplayModel(cfg, row, displayDefaults) ?? configModel;
    const contextTokens = row.contextTokens ?? lookupContextTokens(model) ?? configContextTokens;
    const total = resolveFreshSessionTotalTokens(row);

    const line = [
      formatKindCell(row.kind, rich),
      formatSessionKeyCell(row.key, rich),
      formatSessionAgeCell(row.updatedAt, rich),
      formatSessionModelCell(model, rich),
      formatTokensCell(total, contextTokens ?? null, rich),
      formatSessionFlagsCell(row, rich),
    ].join(" ");

    runtime.log(line.trimEnd());
  }
}
