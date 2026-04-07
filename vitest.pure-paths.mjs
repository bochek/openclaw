import fs from "node:fs";
import path from "node:path";
import {
  commandsLightSourceFiles,
  commandsLightTestFiles,
} from "./vitest.commands-light-paths.mjs";
import { pluginSdkLightSourceFiles, pluginSdkLightTestFiles } from "./vitest.plugin-sdk-paths.mjs";

const normalizeRepoPath = (value) => value.replaceAll("\\", "/");

const pureCandidateGlobs = [
  "packages/memory-host-sdk/**/*.test.ts",
  "packages/plugin-package-contract/**/*.test.ts",
  "src/bootstrap/**/*.test.ts",
  "src/channels/**/*.test.ts",
  "src/config/**/*.test.ts",
  "src/daemon/**/*.test.ts",
  "src/i18n/**/*.test.ts",
  "src/infra/**/*.test.ts",
  "src/interactive/**/*.test.ts",
  "src/link-understanding/**/*.test.ts",
  "src/logging/**/*.test.ts",
  "src/markdown/**/*.test.ts",
  "src/media/**/*.test.ts",
  "src/media-generation/**/*.test.ts",
  "src/music-generation/**/*.test.ts",
  "src/node-host/**/*.test.ts",
  "src/plugin-sdk/**/*.test.ts",
  "src/poll-params.test.ts",
  "src/polls.test.ts",
  "src/process/**/*.test.ts",
  "src/routing/**/*.test.ts",
  "src/sessions/**/*.test.ts",
  "src/shared/**/*.test.ts",
  "src/terminal/**/*.test.ts",
  "src/test-utils/**/*.test.ts",
  "src/tts/**/*.test.ts",
  "src/utils/**/*.test.ts",
  "src/video-generation/**/*.test.ts",
  "test/**/*.test.ts",
];
const pureCandidateExactFiles = [...pluginSdkLightTestFiles, ...commandsLightTestFiles];
const broadPureCandidateGlobs = ["src/**/*.test.ts", "packages/**/*.test.ts", "test/**/*.test.ts"];
const broadPureCandidateSkipGlobs = [
  "**/*.e2e.test.ts",
  "**/*.live.test.ts",
  "test/fixtures/**/*.test.ts",
  "test/setup-home-isolation.test.ts",
  "src/config/schema.base.generated.test.ts",
  "src/gateway/**/*.test.ts",
  "src/security/**/*.test.ts",
  "src/secrets/**/*.test.ts",
  "src/tasks/**/*.test.ts",
];

const disqualifyingPatterns = [
  {
    code: "jsdom-environment",
    pattern: /@vitest-environment\s+jsdom/u,
  },
  {
    code: "module-mocking",
    pattern: /\bvi\.(?:mock|doMock|unmock|doUnmock|importActual|resetModules)\s*\(/u,
  },
  {
    code: "dynamic-import",
    pattern: /\b(?:await\s+)?import\s*\(/u,
  },
  {
    code: "fake-timers",
    pattern:
      /\bvi\.(?:useFakeTimers|setSystemTime|advanceTimers|runAllTimers|runOnlyPendingTimers)\s*\(/u,
  },
  {
    code: "env-or-global-stub",
    pattern: /\bvi\.(?:stubEnv|stubGlobal|unstubAllEnvs|unstubAllGlobals)\s*\(/u,
  },
  {
    code: "process-env-mutation",
    pattern: /(?:process\.env(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])?\s*=|delete\s+process\.env)/u,
  },
  {
    code: "global-mutation",
    pattern: /(?:globalThis|global)\s*\[[^\]]+\]\s*=/u,
  },
  {
    code: "filesystem-state",
    pattern:
      /\b(?:mkdtemp|rmSync|writeFileSync|appendFileSync|mkdirSync|createTemp|makeTempDir|tempDir|tmpdir|node:fs|node:os)\b/u,
  },
  {
    code: "runtime-singleton-state",
    pattern: /\b(?:setActivePluginRegistry|resetPluginRuntimeStateForTest|reset.*ForTest)\s*\(/u,
  },
];

function matchesAnyGlob(file, patterns) {
  return patterns.some((pattern) => path.matchesGlob(file, pattern));
}

function walkFiles(directory, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "vendor") {
        continue;
      }
      walkFiles(entryPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(normalizeRepoPath(entryPath));
    }
  }
  return files;
}

export function classifyPureTestFileContent(source) {
  const reasons = [];
  for (const { code, pattern } of disqualifyingPatterns) {
    if (pattern.test(source)) {
      reasons.push(code);
    }
  }
  return reasons;
}

export function collectPureTestCandidates(cwd = process.cwd()) {
  const discovered = ["src", "packages", "test"]
    .flatMap((directory) => walkFiles(path.join(cwd, directory)))
    .map((file) => normalizeRepoPath(path.relative(cwd, file)))
    .filter(
      (file) =>
        matchesAnyGlob(file, pureCandidateGlobs) &&
        !matchesAnyGlob(file, broadPureCandidateSkipGlobs),
    );
  return [...new Set([...discovered, ...pureCandidateExactFiles])].toSorted((a, b) =>
    a.localeCompare(b),
  );
}

export function collectBroadPureTestCandidates(cwd = process.cwd()) {
  const discovered = ["src", "packages", "test"]
    .flatMap((directory) => walkFiles(path.join(cwd, directory)))
    .map((file) => normalizeRepoPath(path.relative(cwd, file)))
    .filter(
      (file) =>
        matchesAnyGlob(file, broadPureCandidateGlobs) &&
        !matchesAnyGlob(file, broadPureCandidateSkipGlobs),
    );
  return [...new Set([...discovered, ...pureCandidateExactFiles])].toSorted((a, b) =>
    a.localeCompare(b),
  );
}

export function collectPureTestFileAnalysis(cwd = process.cwd(), options = {}) {
  const candidates =
    options.scope === "broad"
      ? collectBroadPureTestCandidates(cwd)
      : collectPureTestCandidates(cwd);
  return candidates.map((file) => {
    const absolutePath = path.join(cwd, file);
    let source = "";
    try {
      source = fs.readFileSync(absolutePath, "utf8");
    } catch {
      return {
        file,
        pure: false,
        reasons: ["missing-file"],
      };
    }
    const reasons = classifyPureTestFileContent(source);
    return {
      file,
      pure: reasons.length === 0,
      reasons,
    };
  });
}

export const pureTestFiles = collectPureTestFileAnalysis()
  .filter((entry) => entry.pure)
  .map((entry) => entry.file);

const pureTestFileSet = new Set(pureTestFiles);
const sourceToPureTestFile = new Map(
  [...pluginSdkLightSourceFiles, ...commandsLightSourceFiles].flatMap((sourceFile) => {
    const testFile = sourceFile.replace(/\.ts$/u, ".test.ts");
    return pureTestFileSet.has(testFile) ? [[sourceFile, testFile]] : [];
  }),
);

export function isPureTestFile(file) {
  return pureTestFileSet.has(normalizeRepoPath(file));
}

export function resolvePureTestIncludePattern(file) {
  const normalized = normalizeRepoPath(file);
  if (pureTestFileSet.has(normalized)) {
    return normalized;
  }
  const siblingTestFile = normalized.replace(/\.ts$/u, ".test.ts");
  if (pureTestFileSet.has(siblingTestFile)) {
    return siblingTestFile;
  }
  return sourceToPureTestFile.get(normalized) ?? null;
}
