import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createLazyPluginLocalModule } from "./lazy-runtime.js";

const tempDirs: string[] = [];

function makeFixtureRoot(prefix: string): string {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(fixtureRoot);
  return fixtureRoot;
}

function writeFixtureFile(fixtureRoot: string, relativePath: string, value: string): string {
  const fullPath = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, value, "utf8");
  return fullPath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("loads nested-package local runtime modules through plugin-sdk aliases", async () => {
  const fixtureRoot = makeFixtureRoot("openclaw-lazy-runtime-");
  const entryPath = writeFixtureFile(
    fixtureRoot,
    "extensions/matrix/src/entry.js",
    'export const fixture = "entry";\n',
  );
  writeFixtureFile(
    fixtureRoot,
    "extensions/matrix/package.json",
    JSON.stringify({
      name: "@openclaw/matrix",
      version: "0.0.0",
      type: "module",
    }) + "\n",
  );
  writeFixtureFile(
    fixtureRoot,
    "extensions/matrix/src/helper.ts",
    [
      'import { normalizeNullableString } from "openclaw/plugin-sdk/text-runtime";',
      'export const marker = normalizeNullableString("  matrix-ok  ");',
      "",
    ].join("\n"),
  );

  const loadHelper = createLazyPluginLocalModule<{ marker: string | null }>(
    pathToFileURL(entryPath).href,
    "./helper.js",
  );
  const previousVitestEnv = process.env.VITEST;
  try {
    delete process.env.VITEST;
    const helperModule = await loadHelper();
    expect(helperModule.marker).toBe("matrix-ok");
  } finally {
    if (previousVitestEnv === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = previousVitestEnv;
    }
  }
});
