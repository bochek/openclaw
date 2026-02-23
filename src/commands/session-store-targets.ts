import { listAgentIds, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveStorePath } from "../config/sessions.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeAgentId } from "../routing/session-key.js";

export type SessionStoreSelectionOptions = {
  store?: string;
  agent?: string;
  allAgents?: boolean;
};

export type SessionStoreTarget = {
  agentId: string;
  storePath: string;
};

export function resolveSessionStoreTargets(
  cfg: OpenClawConfig,
  opts: SessionStoreSelectionOptions,
): SessionStoreTarget[] {
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const hasAgent = Boolean(opts.agent?.trim());
  const allAgents = opts.allAgents === true;
  if (hasAgent && allAgents) {
    throw new Error("--agent and --all-agents cannot be used together");
  }
  if (opts.store && (hasAgent || allAgents)) {
    throw new Error("--store cannot be combined with --agent or --all-agents");
  }

  if (opts.store) {
    return [
      {
        agentId: defaultAgentId,
        storePath: resolveStorePath(opts.store, { agentId: defaultAgentId }),
      },
    ];
  }

  if (allAgents) {
    return listAgentIds(cfg).map((agentId) => ({
      agentId,
      storePath: resolveStorePath(cfg.session?.store, { agentId }),
    }));
  }

  if (hasAgent) {
    const knownAgents = listAgentIds(cfg);
    const requested = normalizeAgentId(opts.agent ?? "");
    if (!knownAgents.includes(requested)) {
      throw new Error(
        `Unknown agent id "${opts.agent}". Use "openclaw agents list" to see configured agents.`,
      );
    }
    return [
      {
        agentId: requested,
        storePath: resolveStorePath(cfg.session?.store, { agentId: requested }),
      },
    ];
  }

  return [
    {
      agentId: defaultAgentId,
      storePath: resolveStorePath(cfg.session?.store, { agentId: defaultAgentId }),
    },
  ];
}
