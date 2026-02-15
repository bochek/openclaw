import fs from "node:fs/promises";
import path from "node:path";

// Why is this in `dist/`?
//
// `npm pack`/`npm publish` will not include a top-level `pnpm-lock.yaml` in the
// tarball, even if it is listed in `package.json#files`.
//
// Packagers (eg Nix) still want the lockfile to deterministically reproduce the
// runtime `node_modules` for a published OpenClaw version.
//
// Workaround: copy it under `dist/` (which is already published) so it ships as
// `dist/pnpm-lock.yaml`.
const repoRoot = process.cwd();
const src = path.join(repoRoot, "pnpm-lock.yaml");
const outDir = path.join(repoRoot, "dist");
const out = path.join(outDir, "pnpm-lock.yaml");

await fs.mkdir(outDir, { recursive: true });
await fs.copyFile(src, out);
