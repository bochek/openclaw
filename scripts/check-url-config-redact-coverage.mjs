#!/usr/bin/env node

import { promises as fs } from "node:fs";
/**
 * Lint: detect schema URL config fields that are missing redact coverage.
 *
 * OpenClaw identifies sensitive URL config in two ways:
 *   1. Path suffix matching via isSensitiveUrlConfigPath() in
 *      redact-sensitive-url.ts
 *   2. Schema metadata via the url-secret tag
 *
 * Either signal is enough. This rule inspects schema fields whose names contain
 * Url/url and reports any field that is covered by neither the path matcher nor
 * the url-secret tag.
 *
 * That prevents regressions like the browser.cdpUrl omission from PR #67679.
 *
 * The sensitive-path rules come from the same shared JSON data used by runtime
 * code, so this lint stays aligned with real behavior without parsing source.
 */
import path from "node:path";
import sensitiveUrlConfigRules from "../src/shared/net/sensitive-url-config-rules.json" with { type: "json" };

// These URL-shaped field names do not carry credentials and do not need redaction.
const SAFE_URL_PATTERNS = [
  /allowUrl$/i, // Allowlist booleans or lists do not carry credentials.
  /urlAllowlist$/i, // URL allowlists do not carry credentials.
  /allowExternalEmbed/i, // External embed allowlists do not carry credentials.
  /hookUrl$/i, // Public callback URLs keep credentials in separate token fields.
];

function isSafeUrlField(key) {
  return SAFE_URL_PATTERNS.some((p) => p.test(key));
}

const SENSITIVE_URL_CONFIG_SUFFIXES = sensitiveUrlConfigRules.suffixes;
const SENSITIVE_URL_CONFIG_PATTERNS = sensitiveUrlConfigRules.patterns.map(
  (pattern) => new RegExp(pattern),
);

function buildIsSensitiveUrlConfigPath() {
  return function isSensitiveUrlConfigPath(configPath) {
    for (const suffix of SENSITIVE_URL_CONFIG_SUFFIXES) {
      if (configPath.endsWith(suffix)) {
        return true;
      }
    }
    for (const regex of SENSITIVE_URL_CONFIG_PATTERNS) {
      if (regex.test(configPath)) {
        return true;
      }
    }
    return false;
  };
}

async function run() {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const isSensitiveUrlConfigPath = buildIsSensitiveUrlConfigPath();

  // Read schema.base.generated.ts and inspect its URL-shaped config fields.
  const schemaPath = path.join(repoRoot, "src/config/schema.base.generated.ts");
  // Expected format: "some.key": { label: "...", help: "...", tags: [...] }
  // Use a non-greedy match plus indentation boundary to avoid spanning entries.
  const content = await fs.readFile(schemaPath, "utf8");
  const entryPattern = /"([^"]+)":\s*\{([\s\S]*?)\n    \}/g;

  const violations = [];
  let match;

  while ((match = entryPattern.exec(content)) !== null) {
    const key = match[1];
    const body = match[2];

    // Only inspect fields whose keys contain Url / url.
    if (!/[Uu]rl/.test(key)) {
      continue;
    }

    // Skip known-safe URL-shaped fields.
    if (isSafeUrlField(key)) {
      continue;
    }

    // Extract tags from the field body.
    const tagsMatch = body.match(/tags:\s*\[([^\]]*)\]/);
    const tags = (tagsMatch?.[1] ?? "")
      .split(",")
      .map((t) => t.trim().replace(/"/g, "").replace(/'/g, ""))
      .filter(Boolean);

    const hasUrlSecret = tags.includes("url-secret");

    // Instantiate wildcard keys before checking the path matcher.
    const instanceKey = key.replace(/\*\./g, "testprofile.");
    const pathCovered = isSensitiveUrlConfigPath(instanceKey);

    // Report fields that are covered by neither mechanism.
    if (!hasUrlSecret && !pathCovered) {
      violations.push({ key, tags });
    }
  }

  if (violations.length === 0) {
    return;
  }

  console.error(
    [
      "URL config fields missing redact coverage (no url-secret tag AND no path match in isSensitiveUrlConfigPath).",
      "",
      "Each URL config field that may contain credentials must be covered by either:",
      "  1. A path suffix rule in isSensitiveUrlConfigPath() (src/shared/net/redact-sensitive-url.ts), OR",
      '  2. A "url-secret" tag in schema.base.generated.ts',
      "",
      "If the field cannot contain credentials (e.g. allowlist, boolean flags), add it to",
      "SAFE_URL_PATTERNS in this script.",
      "",
      "Uncovered fields:",
    ].join("\n"),
  );

  for (const v of violations) {
    console.error(`- ${v.key}  tags: [${v.tags.join(", ")}]`);
  }

  process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
