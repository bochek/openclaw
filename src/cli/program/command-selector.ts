import type { Command } from "commander";
import { isCancel, select as clackSelect, text as clackText } from "@clack/prompts";
import { stylePromptHint, stylePromptMessage } from "../../terminal/prompt-style.js";
import { theme } from "../../terminal/theme.js";
import { fuzzyFilterLower, prepareSearchItems } from "../../tui/components/fuzzy-filter.js";
import { getCoreCliCommandNames, registerCoreCliByName } from "./command-registry.js";
import { getProgramContext } from "./program-context.js";
import { getSubCliEntries, registerSubCliByName } from "./register.subclis.js";

const SEARCH_AGAIN_VALUE = "__search_again__";
const SHOW_HELP_VALUE = "__show_help__";
const PATH_SEPARATOR = "\u0000";
const MAX_MATCHES = 24;

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

  let lastQuery = "";

  while (true) {
    const queryResult = await clackText({
      message: stylePromptMessage("Find a command (fuzzy)") ?? "Find a command (fuzzy)",
      placeholder: "message send",
      defaultValue: lastQuery,
    });
    if (isCancel(queryResult)) {
      return null;
    }

    const query = String(queryResult ?? "").trim();
    lastQuery = query;

    const matches = rankCommandSelectorCandidates(candidates, query);
    if (matches.length === 0) {
      console.error(theme.warn("No matching commands. Try a different search."));
      continue;
    }

    const shown = matches.slice(0, MAX_MATCHES);
    const selection = await clackSelect<string>({
      message:
        stylePromptMessage(
          shown.length === matches.length
            ? `Select a command (${matches.length} matches)`
            : `Select a command (showing ${shown.length} of ${matches.length} matches)`,
        ) ?? "Select a command",
      options: [
        ...shown.map((candidate) => ({
          value: candidate.path.join(PATH_SEPARATOR),
          label: candidate.label,
          hint: stylePromptHint(candidate.description),
        })),
        {
          value: SEARCH_AGAIN_VALUE,
          label: "Search again",
          hint: stylePromptHint("Change your fuzzy query"),
        },
        {
          value: SHOW_HELP_VALUE,
          label: "Show help",
          hint: stylePromptHint("Skip selector and print CLI help"),
        },
      ],
    });

    if (isCancel(selection) || selection === SHOW_HELP_VALUE) {
      return null;
    }
    if (selection === SEARCH_AGAIN_VALUE) {
      continue;
    }

    return selection
      .split(PATH_SEPARATOR)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }
}
