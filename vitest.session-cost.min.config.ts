import { defineConfig } from "vitest/config";
export default defineConfig({ test: { pool: "forks", include: ["src/infra/session-cost-usage.test.ts"] } });
