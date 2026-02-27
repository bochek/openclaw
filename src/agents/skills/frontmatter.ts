import type { Skill } from "@mariozechner/pi-coding-agent";
import { parseFrontmatterBlock } from "../../markdown/frontmatter.js";
import {
  getFrontmatterString,
  normalizeStringList,
  parseOpenClawManifestInstallBase,
  parseFrontmatterBool,
  resolveOpenClawManifestBlock,
  resolveOpenClawManifestInstall,
  resolveOpenClawManifestOs,
  resolveOpenClawManifestRequires,
} from "../../shared/frontmatter.js";
import type {
  OpenClawSkillMetadata,
  ParsedSkillFrontmatter,
  SkillCapability,
  SkillEntry,
  SkillInstallSpec,
  SkillInvocationPolicy,
} from "./types.js";
import { SKILL_CAPABILITIES } from "./types.js";

export function parseFrontmatter(content: string): ParsedSkillFrontmatter {
  return parseFrontmatterBlock(content);
}

function parseInstallSpec(input: unknown): SkillInstallSpec | undefined {
  const parsed = parseOpenClawManifestInstallBase(input, ["brew", "node", "go", "uv", "download"]);
  if (!parsed) {
    return undefined;
  }
  const { raw } = parsed;
  const spec: SkillInstallSpec = {
    kind: parsed.kind as SkillInstallSpec["kind"],
  };

  if (parsed.id) {
    spec.id = parsed.id;
  }
  if (parsed.label) {
    spec.label = parsed.label;
  }
  if (parsed.bins) {
    spec.bins = parsed.bins;
  }
  const osList = normalizeStringList(raw.os);
  if (osList.length > 0) {
    spec.os = osList;
  }
  const formula = typeof raw.formula === "string" ? raw.formula.trim() : "";
  if (formula) {
    spec.formula = formula;
  }
  const cask = typeof raw.cask === "string" ? raw.cask.trim() : "";
  if (!spec.formula && cask) {
    spec.formula = cask;
  }
  if (typeof raw.package === "string") {
    spec.package = raw.package;
  }
  if (typeof raw.module === "string") {
    spec.module = raw.module;
  }
  if (typeof raw.url === "string") {
    spec.url = raw.url;
  }
  if (typeof raw.archive === "string") {
    spec.archive = raw.archive;
  }
  if (typeof raw.extract === "boolean") {
    spec.extract = raw.extract;
  }
  if (typeof raw.stripComponents === "number") {
    spec.stripComponents = raw.stripComponents;
  }
  if (typeof raw.targetDir === "string") {
    spec.targetDir = raw.targetDir;
  }

  return spec;
}

export function resolveOpenClawMetadata(
  frontmatter: ParsedSkillFrontmatter,
): OpenClawSkillMetadata | undefined {
  const metadataObj = resolveOpenClawManifestBlock({ frontmatter });
  if (!metadataObj) {
    return undefined;
  }
  const requires = resolveOpenClawManifestRequires(metadataObj);
  const install = resolveOpenClawManifestInstall(metadataObj, parseInstallSpec);
  const osRaw = resolveOpenClawManifestOs(metadataObj);
  return {
    always: typeof metadataObj.always === "boolean" ? metadataObj.always : undefined,
    emoji: typeof metadataObj.emoji === "string" ? metadataObj.emoji : undefined,
    homepage: typeof metadataObj.homepage === "string" ? metadataObj.homepage : undefined,
    skillKey: typeof metadataObj.skillKey === "string" ? metadataObj.skillKey : undefined,
    primaryEnv: typeof metadataObj.primaryEnv === "string" ? metadataObj.primaryEnv : undefined,
    os: osRaw.length > 0 ? osRaw : undefined,
    requires: requires,
    install: install.length > 0 ? install : undefined,
    capabilities: parseCapabilities(metadataObj.capabilities),
  };
}

function parseCapabilities(raw: unknown): SkillCapability[] | undefined {
  const canonical = new Set<SkillCapability>();
  const names = extractCapabilityNames(raw);
  for (const name of names) {
    const normalized = normalizeCapabilityName(name);
    if (normalized) {
      canonical.add(normalized);
    }
  }
  return canonical.size > 0 ? [...canonical] : undefined;
}

const CAPABILITY_SET = new Set<string>(SKILL_CAPABILITIES as readonly string[]);

// Accept common naming used across Codex/Claude/Cursor and map to canonical OpenClaw capabilities.
const CAPABILITY_ALIASES: Record<string, SkillCapability> = {
  // shell
  bash: "shell",
  command: "shell",
  commands: "shell",
  exec: "shell",
  process: "shell",
  shell: "shell",
  terminal: "shell",
  "shell.exec": "shell",
  "shell.execute": "shell",
  shell_exec: "shell",

  // filesystem
  "apply-patch": "filesystem",
  apply_patch: "filesystem",
  edit: "filesystem",
  file: "filesystem",
  files: "filesystem",
  filesystem: "filesystem",
  fs: "filesystem",
  write: "filesystem",

  // network
  fetch: "network",
  http: "network",
  mcp: "network",
  network: "network",
  web: "network",
  webfetch: "network",
  "web-fetch": "network",
  web_fetch: "network",
  web_search: "network",
  "web.search": "network",
  "network.fetch": "network",
  "network.search": "network",

  // browser / computer-use style
  browser: "browser",
  "computer-use": "browser",
  computer_use: "browser",
  gui: "browser",
  screen: "browser",
  ui: "browser",

  // sessions / orchestration
  delegate: "sessions",
  orchestration: "sessions",
  sessions: "sessions",
  sessions_send: "sessions",
  sessions_spawn: "sessions",
  subagent: "sessions",
  subagents: "sessions",

  // messaging
  chat: "messaging",
  message: "messaging",
  messages: "messaging",
  messaging: "messaging",

  // scheduling
  cron: "scheduling",
  schedule: "scheduling",
  scheduler: "scheduling",
  scheduling: "scheduling",
  timer: "scheduling",
};

function normalizeCapabilityName(raw: string): SkillCapability | undefined {
  const key = raw.trim().toLowerCase();
  if (!key) {
    return undefined;
  }
  if (CAPABILITY_SET.has(key)) {
    return key as SkillCapability;
  }
  const alias = CAPABILITY_ALIASES[key];
  if (alias) {
    return alias;
  }
  const firstSegment = key.split(/[._:-]/)[0];
  if (CAPABILITY_SET.has(firstSegment)) {
    return firstSegment as SkillCapability;
  }
  return undefined;
}

function extractCapabilityNames(raw: unknown): string[] {
  if (!raw) {
    return [];
  }
  if (typeof raw === "string") {
    return normalizeStringList(raw);
  }
  if (Array.isArray(raw)) {
    const names: string[] = [];
    for (const entry of raw) {
      if (typeof entry === "string") {
        names.push(entry);
        continue;
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        const candidate = [obj.name, obj.type, obj.id, obj.capability].find(
          (value) => typeof value === "string",
        );
        if (typeof candidate === "string") {
          names.push(candidate);
        }
      }
    }
    return names;
  }
  if (typeof raw === "object") {
    return Object.keys(raw as Record<string, unknown>);
  }
  return [];
}

export function resolveSkillInvocationPolicy(
  frontmatter: ParsedSkillFrontmatter,
): SkillInvocationPolicy {
  return {
    userInvocable: parseFrontmatterBool(getFrontmatterString(frontmatter, "user-invocable"), true),
    disableModelInvocation: parseFrontmatterBool(
      getFrontmatterString(frontmatter, "disable-model-invocation"),
      false,
    ),
  };
}

export function resolveSkillKey(skill: Skill, entry?: SkillEntry): string {
  return entry?.metadata?.skillKey ?? skill.name;
}
