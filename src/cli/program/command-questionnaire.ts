import type { Argument, Command, Option } from "commander";
import {
  isCancel,
  multiselect as clackMultiselect,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import { stylePromptHint, stylePromptMessage } from "../../terminal/prompt-style.js";
import { resolveCommandByPath } from "./command-selector.js";

const INTERNAL_OPTION_NAMES = new Set(["help", "version", "interactive"]);

type PromptResult = string[] | null;

type OptionalParameterEntry =
  | {
      id: string;
      label: string;
      hint?: string;
      kind: "option";
      option: Option;
    }
  | {
      id: string;
      label: string;
      hint?: string;
      kind: "argument";
      argument: Argument;
    };

export function splitMultiValueInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function preferredOptionFlag(option: Option): string {
  return option.long ?? option.short ?? option.flags.split(/[ ,|]+/)[0] ?? option.flags;
}

export function shouldPromptForOption(option: Option): boolean {
  if (option.hidden) {
    return false;
  }
  return !INTERNAL_OPTION_NAMES.has(option.name());
}

export function isRequiredOption(option: Option): boolean {
  return shouldPromptForOption(option) && option.mandatory;
}

function formatArgumentLabel(argument: Argument): string {
  const wrapped = argument.required ? `<${argument.name()}>` : `[${argument.name()}]`;
  return argument.variadic ? wrapped.replace(/([\]>])$/, "...$1") : wrapped;
}

function buildArgumentHint(argument: Argument): string {
  if (argument.description) {
    return argument.description;
  }
  return argument.required ? "Required argument" : "Optional argument";
}

function buildOptionHint(option: Option): string {
  const desc = option.description?.trim();
  if (desc) {
    return desc;
  }
  return option.mandatory ? "Required option" : "Optional option";
}

export function buildOptionalParameterEntries(command: Command): OptionalParameterEntry[] {
  const entries: OptionalParameterEntry[] = [];

  for (const option of command.options) {
    if (!shouldPromptForOption(option) || option.mandatory) {
      continue;
    }
    entries.push({
      id: `opt:${option.attributeName()}`,
      label: preferredOptionFlag(option),
      hint: buildOptionHint(option),
      kind: "option",
      option,
    });
  }

  command.registeredArguments.forEach((argument, index) => {
    if (argument.required) {
      return;
    }
    entries.push({
      id: `arg:${index}:${argument.name()}`,
      label: formatArgumentLabel(argument),
      hint: buildArgumentHint(argument),
      kind: "argument",
      argument,
    });
  });

  return entries;
}

async function askValue(params: {
  message: string;
  placeholder?: string;
  required?: boolean;
}): Promise<string | null> {
  const value = await clackText({
    message: stylePromptMessage(params.message) ?? params.message,
    placeholder: params.placeholder,
    validate: params.required
      ? (input) => {
          if (!input || input.trim().length === 0) {
            return "Value required";
          }
          return undefined;
        }
      : undefined,
  });
  if (isCancel(value)) {
    return null;
  }
  return String(value ?? "").trim();
}

async function askChoice(params: {
  message: string;
  choices: readonly string[];
  hint?: string;
}): Promise<string | null> {
  const choice = await clackSelect<string>({
    message: stylePromptMessage(params.message) ?? params.message,
    options: params.choices.map((value) => ({
      value,
      label: value,
      hint: params.hint ? stylePromptHint(params.hint) : undefined,
    })),
  });
  if (isCancel(choice)) {
    return null;
  }
  return choice;
}

async function promptArgumentValue(argument: Argument, required: boolean): Promise<PromptResult> {
  const label = argument.name();
  const suffix = argument.description ? ` — ${argument.description}` : "";

  if (argument.argChoices && argument.argChoices.length > 0 && !argument.variadic) {
    const choice = await askChoice({
      message: `Select value for <${label}>`,
      choices: argument.argChoices,
      hint: argument.description,
    });
    return choice === null ? null : [choice];
  }

  if (argument.variadic) {
    const raw = await askValue({
      message: `Values for <${label}...> (space/comma-separated)${suffix}`,
      placeholder: required ? "value1 value2" : "optional",
      required,
    });
    if (raw === null) {
      return null;
    }
    const values = splitMultiValueInput(raw);
    if (required && values.length === 0) {
      return null;
    }
    return values;
  }

  const value = await askValue({
    message: `Value for <${label}>${suffix}`,
    required,
  });
  if (value === null) {
    return null;
  }
  if (!value && !required) {
    return [];
  }
  return [value];
}

async function promptOptionValue(option: Option, required: boolean): Promise<PromptResult> {
  const flag = preferredOptionFlag(option);
  const description = option.description ? ` — ${option.description}` : "";

  if (option.isBoolean()) {
    // Required booleans imply the flag must be set.
    // Optional booleans are only prompted when selected in the optional multiselect.
    return [flag];
  }

  if (option.argChoices && option.argChoices.length > 0 && !option.variadic) {
    const choice = await askChoice({
      message: `Select value for ${flag}`,
      choices: option.argChoices,
      hint: option.description,
    });
    return choice === null ? null : [flag, choice];
  }

  if (option.optional) {
    const raw = await askValue({
      message: `Optional value for ${flag} (leave empty for flag only)${description}`,
      required: false,
    });
    if (raw === null) {
      return null;
    }
    if (required && raw.length === 0) {
      return [flag];
    }
    return raw.length > 0 ? [flag, raw] : [flag];
  }

  if (option.variadic) {
    const raw = await askValue({
      message: `Values for ${flag} (space/comma-separated)${description}`,
      placeholder: "value1 value2",
      required,
    });
    if (raw === null) {
      return null;
    }
    const values = splitMultiValueInput(raw);
    if (values.length === 0) {
      return required ? null : [flag];
    }
    const tokens: string[] = [];
    for (const value of values) {
      tokens.push(flag, value);
    }
    return tokens;
  }

  const value = await askValue({
    message: `Value for ${flag}${description}`,
    required,
  });
  if (value === null) {
    return null;
  }
  if (!value && !required) {
    return [];
  }
  return [flag, value];
}

export async function runCommandQuestionnaire(params: {
  program: Command;
  commandPath: string[];
}): Promise<string[] | null> {
  const command = resolveCommandByPath(params.program, params.commandPath);
  if (!command) {
    return [];
  }

  const optionTokens: string[] = [];
  const argumentTokens: string[] = [];

  // 1) Ask only required parameters first.
  for (const argument of command.registeredArguments) {
    if (!argument.required) {
      continue;
    }
    const tokens = await promptArgumentValue(argument, true);
    if (tokens === null) {
      return null;
    }
    argumentTokens.push(...tokens);
  }

  for (const option of command.options) {
    if (!isRequiredOption(option)) {
      continue;
    }
    const tokens = await promptOptionValue(option, true);
    if (tokens === null) {
      return null;
    }
    optionTokens.push(...tokens);
  }

  // 2) Then let user pick optional parameters to activate.
  const optionalEntries = buildOptionalParameterEntries(command);
  if (optionalEntries.length > 0) {
    const selected = await clackMultiselect<string>({
      message:
        stylePromptMessage("Select optional parameters to set") ??
        "Select optional parameters to set",
      options: optionalEntries.map((entry) => ({
        value: entry.id,
        label: entry.label,
        hint: entry.hint ? stylePromptHint(entry.hint) : undefined,
      })),
      required: false,
    });
    if (isCancel(selected)) {
      return null;
    }

    const selectedIds = new Set(Array.isArray(selected) ? selected : []);
    for (const entry of optionalEntries) {
      if (!selectedIds.has(entry.id)) {
        continue;
      }
      if (entry.kind === "option") {
        const tokens = await promptOptionValue(entry.option, false);
        if (tokens === null) {
          return null;
        }
        optionTokens.push(...tokens);
        continue;
      }
      const tokens = await promptArgumentValue(entry.argument, true);
      if (tokens === null) {
        return null;
      }
      argumentTokens.push(...tokens);
    }
  }

  return [...optionTokens, ...argumentTokens];
}
