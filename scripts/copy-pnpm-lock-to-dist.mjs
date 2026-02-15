import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const src = path.join(repoRoot, "pnpm-lock.yaml");
const outDir = path.join(repoRoot, "dist");
const out = path.join(outDir, "pnpm-lock.yaml");

await fs.mkdir(outDir, { recursive: true });
await fs.copyFile(src, out);
