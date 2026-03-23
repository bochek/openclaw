import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function main() {
  execFileSync(PNPM_COMMAND, ["build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCLAW_INCLUDE_OPTIONAL_BUNDLED: "1",
    },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    if (typeof status === "number") {
      process.exit(status);
    }
    throw error;
  }
}
