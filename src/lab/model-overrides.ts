import fs from "node:fs";
import path from "node:path";
import { resolveSessionAgentIds } from "../agents/agent-scope.js";
import {
  resolveDefaultModelForAgent,
  resolvePersistedSelectedModelRef,
} from "../agents/model-selection.js";
import { DEFAULT_AGENTS_FILENAME, type WorkspaceBootstrapFile } from "../agents/workspace.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { openBoundaryFile } from "../infra/boundary-file-read.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";

const LABS_PLUGIN_ID = "lab";
const LABS_MODEL_OVERRIDE_ROOT_SEGMENTS = [".openclaw", "lab", "overrides"] as const;
const LABS_AGENT_OVERRIDE_ROOT_SEGMENTS = [".openclaw", "lab", "agents"] as const;
const MAX_LABS_OVERRIDE_BYTES = 2 * 1024 * 1024;

export type LabsAgentsAddendumKind = "model" | "agent";

export type LabsAgentsAddendum = WorkspaceBootstrapFile & {
  labsKind: LabsAgentsAddendumKind;
};

type LabsPluginEntryLike = {
  enabled?: boolean;
  config?: {
    modelOverrides?: {
      enabled?: boolean;
    };
  };
};

function getLabsPluginEntry(cfg?: OpenClawConfig): LabsPluginEntryLike | undefined {
  return cfg?.plugins?.entries?.[LABS_PLUGIN_ID] as LabsPluginEntryLike | undefined;
}

function normalizeLabsPath(pathValue?: string): string {
  return normalizeOptionalString(pathValue)?.replace(/\\/g, "/") ?? "";
}

async function loadLabsAgentsAddendum(params: {
  workspaceDir: string;
  absolutePath: string;
  kind: LabsAgentsAddendumKind;
}): Promise<LabsAgentsAddendum | null> {
  const opened = await openBoundaryFile({
    absolutePath: params.absolutePath,
    rootPath: params.workspaceDir,
    boundaryLabel: "workspace root",
    maxBytes: MAX_LABS_OVERRIDE_BYTES,
  });
  if (!opened.ok) {
    if (opened.reason === "io") {
      const code = (opened.error as { code?: string } | undefined)?.code;
      if (code === "ENOENT") {
        return null;
      }
    }
    return null;
  }
  try {
    const content = fs.readFileSync(opened.fd, "utf-8");
    return {
      name: DEFAULT_AGENTS_FILENAME,
      path: params.absolutePath,
      content,
      missing: false,
      labsKind: params.kind,
    };
  } finally {
    fs.closeSync(opened.fd);
  }
}

export async function loadLabsModelAgentsOverride(params: {
  workspaceDir: string;
  modelId?: string;
  cfg?: OpenClawConfig;
}): Promise<LabsAgentsAddendum | null> {
  if (!isLabsModelOverridesEnabled(params.cfg)) {
    return null;
  }
  const modelId = normalizeOptionalString(params.modelId) ?? "";
  if (!modelId) {
    return null;
  }
  return await loadLabsAgentsAddendum({
    workspaceDir: params.workspaceDir,
    absolutePath: resolveLabsModelAgentsOverridePath(params.workspaceDir, modelId),
    kind: "model",
  });
}

export async function loadLabsAgentAgentsOverride(params: {
  workspaceDir: string;
  modelId?: string;
  agentId?: string;
  cfg?: OpenClawConfig;
}): Promise<LabsAgentsAddendum | null> {
  if (!isLabsModelOverridesEnabled(params.cfg)) {
    return null;
  }
  const modelId = normalizeOptionalString(params.modelId) ?? "";
  const agentId = normalizeOptionalString(params.agentId) ?? "";
  if (!modelId || !agentId) {
    return null;
  }
  return await loadLabsAgentsAddendum({
    workspaceDir: params.workspaceDir,
    absolutePath: resolveLabsAgentAgentsOverridePath(params.workspaceDir, agentId, modelId),
    kind: "agent",
  });
}

export function isLabsPluginEnabled(cfg?: OpenClawConfig): boolean {
  return getLabsPluginEntry(cfg)?.enabled !== false;
}

export function isLabsModelOverridesEnabled(cfg?: OpenClawConfig): boolean {
  if (!isLabsPluginEnabled(cfg)) {
    return false;
  }
  return getLabsPluginEntry(cfg)?.config?.modelOverrides?.enabled === true;
}

export function resolveLabsModelAgentsOverridePath(workspaceDir: string, modelId: string): string {
  return path.join(
    workspaceDir,
    ...LABS_MODEL_OVERRIDE_ROOT_SEGMENTS,
    modelId,
    DEFAULT_AGENTS_FILENAME,
  );
}

export function resolveLabsAgentAgentsOverridePath(
  workspaceDir: string,
  agentId: string,
  modelId: string,
): string {
  return path.join(
    workspaceDir,
    ...LABS_AGENT_OVERRIDE_ROOT_SEGMENTS,
    normalizeAgentId(agentId),
    "overrides",
    modelId,
    DEFAULT_AGENTS_FILENAME,
  );
}

export function isLabsAgentsOverridePath(pathValue: string): boolean {
  const normalized = normalizeLabsPath(pathValue);
  if (!normalized) {
    return false;
  }
  return (
    (normalized.includes("/.openclaw/lab/overrides/") ||
      normalized.includes("/.openclaw/lab/agents/")) &&
    normalized.endsWith(`/${DEFAULT_AGENTS_FILENAME}`)
  );
}

export async function loadLabsAgentsOverrides(params: {
  workspaceDir: string;
  modelId?: string;
  agentId?: string;
  cfg?: OpenClawConfig;
}): Promise<LabsAgentsAddendum[]> {
  const overrides: LabsAgentsAddendum[] = [];
  const modelOverride = await loadLabsModelAgentsOverride(params);
  if (modelOverride) {
    overrides.push(modelOverride);
  }
  const agentOverride = await loadLabsAgentAgentsOverride(params);
  if (agentOverride) {
    overrides.push(agentOverride);
  }
  return overrides;
}

export function appendLabsAgentsOverrideFiles(params: {
  files: WorkspaceBootstrapFile[];
  overrideFiles?: WorkspaceBootstrapFile[] | null;
}): WorkspaceBootstrapFile[] {
  const overrideFiles = params.overrideFiles?.filter(Boolean) ?? [];
  if (overrideFiles.length === 0) {
    return params.files;
  }
  const insertAfterIndex = params.files.findIndex((file) => file.name === DEFAULT_AGENTS_FILENAME);
  if (insertAfterIndex === -1) {
    return [...overrideFiles, ...params.files];
  }
  const next = [...params.files];
  next.splice(insertAfterIndex, 0, ...overrideFiles);
  return next;
}

export function hasTruncatedLabsAgentsOverrideFiles(
  report:
    | {
        injectedWorkspaceFiles?: Array<{ path?: string; truncated?: boolean }>;
      }
    | undefined,
  overridePaths?: string[],
): boolean {
  const entries = report?.injectedWorkspaceFiles;
  if (!Array.isArray(entries) || entries.length === 0) {
    return false;
  }
  const normalizedOverridePaths = new Set(
    (overridePaths ?? []).map((value) => normalizeLabsPath(value)).filter(Boolean),
  );
  return entries.some((entry) => {
    if (entry?.truncated !== true) {
      return false;
    }
    const entryPath = normalizeLabsPath(entry.path);
    if (!entryPath) {
      return false;
    }
    if (normalizedOverridePaths.size > 0) {
      return normalizedOverridePaths.has(entryPath);
    }
    return isLabsAgentsOverridePath(entryPath);
  });
}

export function listActiveLabsAgentsOverridePaths(params: {
  workspaceDir: string;
  modelId: string;
  agentId?: string;
}): string[] {
  const paths = [resolveLabsModelAgentsOverridePath(params.workspaceDir, params.modelId)];
  const agentId = normalizeOptionalString(params.agentId) ?? "";
  if (agentId) {
    paths.push(resolveLabsAgentAgentsOverridePath(params.workspaceDir, agentId, params.modelId));
  }
  return paths;
}

export function resolveCurrentLabsModelId(params: {
  cfg: OpenClawConfig;
  sessionEntry?: SessionEntry;
  agentId?: string;
}): string {
  const defaultModel = resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: params.agentId,
  });
  const selected = resolvePersistedSelectedModelRef({
    defaultProvider: defaultModel.provider,
    runtimeProvider: params.sessionEntry?.modelProvider,
    runtimeModel: params.sessionEntry?.model,
    overrideProvider: params.sessionEntry?.providerOverride,
    overrideModel: params.sessionEntry?.modelOverride,
  });
  return selected?.model ?? defaultModel.model;
}

export function resolveCurrentLabsAgentId(params: {
  cfg?: OpenClawConfig;
  sessionKey?: string;
  agentId?: string;
}): string {
  return resolveSessionAgentIds({
    config: params.cfg,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
  }).sessionAgentId;
}
