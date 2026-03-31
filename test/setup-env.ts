import { vi } from "vitest";
import { withIsolatedTestHome } from "./test-env.js";

const isBunRuntime = typeof Bun !== "undefined";
const TEST_ENV_STATE_KEY = Symbol.for("openclaw.testEnvState");
const TEST_PROCESS_MAX_LISTENERS = 128;

type TestEnvState = ReturnType<typeof withIsolatedTestHome>;

type GlobalWithTestEnvState = typeof globalThis & {
  [TEST_ENV_STATE_KEY]?: TestEnvState;
};

export function getInstalledTestEnv(): TestEnvState {
  const globalState = globalThis as GlobalWithTestEnvState;
  if (!globalState[TEST_ENV_STATE_KEY]) {
    globalState[TEST_ENV_STATE_KEY] = withIsolatedTestHome();
  }
  return globalState[TEST_ENV_STATE_KEY];
}

if (!isBunRuntime) {
  vi.mock("@mariozechner/pi-ai", async (importOriginal) => {
    const original = await importOriginal<typeof import("@mariozechner/pi-ai")>();
    return {
      ...original,
      getOAuthApiKey: () => undefined,
      getOAuthProviders: () => [],
      loginOpenAICodex: vi.fn(),
    };
  });
}

vi.mock("@mariozechner/clipboard", () => ({
  availableFormats: () => [],
  getText: async () => "",
  setText: async () => {},
  hasText: () => false,
  getImageBinary: async () => [],
  getImageBase64: async () => "",
  setImageBinary: async () => {},
  setImageBase64: async () => {},
  hasImage: () => false,
  getHtml: async () => "",
  setHtml: async () => {},
  hasHtml: () => false,
  getRtf: async () => "",
  setRtf: async () => {},
  hasRtf: () => false,
  clear: async () => {},
  watch: () => {},
  callThreadsafeFunction: () => {},
}));

process.env.VITEST = "true";
process.env.OPENCLAW_PLUGIN_MANIFEST_CACHE_MS ??= "60000";

if (process.getMaxListeners() > 0 && process.getMaxListeners() < TEST_PROCESS_MAX_LISTENERS) {
  process.setMaxListeners(TEST_PROCESS_MAX_LISTENERS);
}

getInstalledTestEnv();
