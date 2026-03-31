import { defineConfig } from "vitest/config";
export default defineConfig({ test: { pool: "forks", include: ["src/plugins/provider-wizard.test.ts"] } });
