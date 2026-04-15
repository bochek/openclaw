import { parseExecArgvToken } from "./exec-command-resolution.js";
import { type SafeBinProfile } from "./exec-safe-bin-policy-profiles.js";
import { validateSafeBinSemantics } from "./exec-safe-bin-semantics.js";

function isPathLikeToken(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === "-") {
    return false;
  }
  if (trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith("~")) {
    return true;
  }
  if (trimmed.startsWith("/")) {
    return true;
  }
  return /^[A-Za-z]:[\\/]/.test(trimmed);
}

function hasGlobToken(value: string): boolean {
  // Safe bins are stdin-only; globbing is both surprising and a historical bypass vector.
  // Note: we still harden execution-time expansion separately.
  return /[*?[\]]/.test(value);
}

const NO_FLAGS: ReadonlySet<string> = new Set();

function isSafeLiteralToken(value: string): boolean {
  if (!value || value === "-") {
    return true;
  }
  return !hasGlobToken(value) && !isPathLikeToken(value);
}

function isInvalidValueToken(value: string | undefined): boolean {
  return !value || !isSafeLiteralToken(value);
}

function resolveCanonicalLongFlag(
  flag: string,
  knownLongFlags: readonly string[],
): string | null {
  if (!flag.startsWith("--") || flag.length <= 2) {
    return null;
  }
  if (knownLongFlags.includes(flag)) {
    return flag;
  }
  const matches = knownLongFlags.filter((f) => f.startsWith(flag));
  return matches.length === 1 ? matches[0] : null;
}

function consumeLongOptionToken(params: {
  args: string[];
  index: number;
  flag: string;
  inlineValue: string | undefined;
  allowedValueFlags: ReadonlySet<string>;
  deniedFlags: ReadonlySet<string>;
  knownLongFlags: readonly string[];
}): number {
  const canonicalFlag = resolveCanonicalLongFlag(params.flag, params.knownLongFlags);
  if (!canonicalFlag) {
    return -1;
  }
  if (params.deniedFlags.has(canonicalFlag)) {
    return -1;
  }
  const expectsValue = params.allowedValueFlags.has(canonicalFlag);
  if (params.inlineValue !== undefined) {
    if (!expectsValue) {
      return -1;
    }
    return isSafeLiteralToken(params.inlineValue) ? params.index + 1 : -1;
  }
  if (!expectsValue) {
    return params.index + 1;
  }
  return isInvalidValueToken(params.args[params.index + 1]) ? -1 : params.index + 2;
}

function consumeShortOptionClusterToken(params: {
  args: string[];
  index: number;
  cluster: string;
  flags: string[];
  allowedValueFlags: ReadonlySet<string>;
  deniedFlags: ReadonlySet<string>;
}): number {
  for (let j = 0; j < params.flags.length; j += 1) {
    const flag = params.flags[j];
    if (params.deniedFlags.has(flag)) {
      return -1;
    }
    if (!params.allowedValueFlags.has(flag)) {
      continue;
    }
    const inlineValue = params.cluster.slice(j + 1);
    if (inlineValue) {
      return isSafeLiteralToken(inlineValue) ? params.index + 1 : -1;
    }
    return isInvalidValueToken(params.args[params.index + 1]) ? -1 : params.index + 2;
  }
  return -1;
}

function consumePositionalToken(token: string, positional: string[]): boolean {
  if (!isSafeLiteralToken(token)) {
    return false;
  }
  positional.push(token);
  return true;
}

function validatePositionalCount(positional: string[], profile: SafeBinProfile): boolean {
  const minPositional = profile.minPositional ?? 0;
  if (positional.length < minPositional) {
    return false;
  }
  if (typeof profile.maxPositional === "number" && positional.length > profile.maxPositional) {
    return false;
  }
  return true;
}

function collectKnownLongFlags(
  allowedValueFlags: ReadonlySet<string>,
  deniedFlags: ReadonlySet<string>,
): string[] {
  const known = new Set<string>();
  for (const flag of allowedValueFlags) {
    if (flag.startsWith("--")) {
      known.add(flag);
    }
  }
  for (const flag of deniedFlags) {
    if (flag.startsWith("--")) {
      known.add(flag);
    }
  }
  return Array.from(known);
}

function collectPositionalTokens(args: string[], profile: SafeBinProfile): string[] | null {
  const allowedValueFlags = profile.allowedValueFlags ?? NO_FLAGS;
  const deniedFlags = profile.deniedFlags ?? NO_FLAGS;
  const knownLongFlags = collectKnownLongFlags(allowedValueFlags, deniedFlags);

  const positional: string[] = [];
  let i = 0;
  while (i < args.length) {
    const rawToken = args[i] ?? "";
    const token = parseExecArgvToken(rawToken);

    if (token.kind === "empty" || token.kind === "stdin") {
      i += 1;
      continue;
    }

    if (token.kind === "terminator") {
      for (let j = i + 1; j < args.length; j += 1) {
        const rest = args[j];
        if (!rest || rest === "-") {
          continue;
        }
        if (!consumePositionalToken(rest, positional)) {
          return null;
        }
      }
      break;
    }

    if (token.kind === "positional") {
      if (!consumePositionalToken(token.raw, positional)) {
        return null;
      }
      i += 1;
      continue;
    }

    if (token.style === "long") {
      const nextIndex = consumeLongOptionToken({
        args,
        index: i,
        flag: token.flag,
        inlineValue: token.inlineValue,
        allowedValueFlags,
        deniedFlags,
        knownLongFlags,
      });
      if (nextIndex < 0) {
        return null;
      }
      i = nextIndex;
      continue;
    }

    const nextIndex = consumeShortOptionClusterToken({
      args,
      index: i,
      cluster: token.cluster,
      flags: token.flags,
      allowedValueFlags,
      deniedFlags,
    });
    if (nextIndex < 0) {
      return null;
    }
    i = nextIndex;
  }

  return positional;
}

export function validateSafeBinArgv(
  args: string[],
  profile: SafeBinProfile,
  options?: { binName?: string },
): boolean {
  const positional = collectPositionalTokens(args, profile);
  if (!positional) {
    return false;
  }
  if (!validatePositionalCount(positional, profile)) {
    return false;
  }
  return validateSafeBinSemantics({
    binName: options?.binName,
    positional,
  });
}
