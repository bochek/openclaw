import type { Command } from "commander";
import { autocomplete as clackAutocomplete, isCancel } from "@clack/prompts";
import { stylePromptHint, stylePromptMessage } from "../../terminal/prompt-style.js";
import { fuzzyFilterLower, prepareSearchItems } from "../../tui/components/fuzzy-filter.js";
import { getCoreCliCommandNames, registerCoreCliByName } from "./command-registry.js";
import { getProgramContext } from "./program-context.js";
import { getSubCliEntries, registerSubCliByName } from "./register.subclis.js";

const SHOW_HELP_VALUE = "__show_help__";
const PATH_SEPARATOR = "\u0000";
const MAX_RESULTS = 200;

type CommandSelectorCandidate = {
  path: string[];
  label: string;
  description: string;
  searchText: string;
};

type PreparedCommandSelectorCandidate = CommandSelectorCandidate & {
  searchTextLower: string;
};

function isHiddenCommand(command: Command): boolean {
  // Commander stores hidden state on a private field.
  return Boolean((command as Command & { _hidden?: boolean })._hidden);
}

function resolveCommandDescription(command: Command): string {
  const summary = typeof command.summary === "function" ? command.summary().trim() : "";
  if (summary) {
    return summary;
  }
  const description = command.description().trim();
  if (description) {
    return description;
  }
  return "Run this command";
}

function collectCandidatesRecursive(params: {
  command: Command;
  parentPath: string[];
  seen: Set<string>;
  out: CommandSelectorCandidate[];
}): void {
  for (const child of params.command.commands) {
    if (isHiddenCommand(child) || child.name() === "help") {
      continue;
    }
    const path = [...params.parentPath, child.name()];
    const label = path.join(" ");
    if (!params.seen.has(label)) {
      params.seen.add(label);
      params.out.push({
        path,
        label,
        description: resolveCommandDescription(child),
        searchText: path.join(" "),
      });
    }

    collectCandidatesRecursive({
      command: child,
      parentPath: path,
      seen: params.seen,
      out: params.out,
    });
  }
}

export function collectCommandSelectorCandidates(
  program: Command,
): PreparedCommandSelectorCandidate[] {
  const seen = new Set<string>();
  const raw: CommandSelectorCandidate[] = [];
  collectCandidatesRecursive({ command: program, parentPath: [], seen, out: raw });
  const prepared = prepareSearchItems(raw);
  prepared.sort((a, b) => a.label.localeCompare(b.label));
  return prepared;
}

export function rankCommandSelectorCandidates(
  candidates: PreparedCommandSelectorCandidate[],
  query: string,
): PreparedCommandSelectorCandidate[] {
  const queryLower = query.trim().toLowerCase();
  if (!queryLower) {
    return candidates;
  }
  return fuzzyFilterLower(candidates, queryLower);
}

async function hydrateProgramCommandsForSelector(program: Command): Promise<void> {
  const ctx = getProgramContext(program);
  if (ctx) {
    for (const name of getCoreCliCommandNames()) {
      try {
        await registerCoreCliByName(program, ctx, name);
      } catch {
        // Keep selector usable even if one registrar fails in this environment.
      }
    }
  }

  for (const entry of getSubCliEntries()) {
    try {
      await registerSubCliByName(program, entry.name);
    } catch {
      // Keep selector usable even if one registrar fails in this environment.
    }
  }
}

export async function runInteractiveCommandSelector(program: Command): Promise<string[] | null> {
  await hydrateProgramCommandsForSelector(program);

  const candidates = collectCommandSelectorCandidates(program);
  if (candidates.length === 0) {
    return null;
  }

  const selection = await clackAutocomplete<string>({
    message: stylePromptMessage("Find and run a command") ?? "Find and run a command",
    placeholder: "Type to fuzzy-search (e.g. msg snd)",
    maxItems: 10,
    // We pre-rank the list with our fuzzy scorer, then opt out of clack's own
    // filter so item order stays stable and score-based.
    filter: () => true,
    options() {
      const query = this.userInput.trim();
      const ranked = rankCommandSelectorCandidates(candidates, query).slice(0, MAX_RESULTS);
      return [
        ...ranked.map((candidate) => ({
          value: candidate.path.join(PATH_SEPARATOR),
          label: candidate.label,
          hint: stylePromptHint(candidate.description),
        })),
        {
          value: SHOW_HELP_VALUE,
          label: "Show help",
          hint: stylePromptHint("Skip selector and print CLI help"),
        },
      ];
    },
  });

  if (isCancel(selection) || selection === SHOW_HELP_VALUE) {
    return null;
  }

  return selection
    .split(PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);
}
