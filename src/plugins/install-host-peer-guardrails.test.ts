import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIN_HOST_VERSION = ">=2026.3.14";
const INSTALLABLE_PLUGIN_IDS_REQUIRING_HOST_FLOOR = [
  "bluebubbles",
  "discord",
  "feishu",
  "googlechat",
  "irc",
  "line",
  "matrix",
  "mattermost",
  "msteams",
  "nextcloud-talk",
  "nostr",
  "tlon",
  "twitch",
  "voice-call",
  "whatsapp",
  "zalo",
  "zalouser",
] as const;

function readPackageManifest(pluginId: string) {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "extensions", pluginId, "package.json"), "utf8"),
  ) as {
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  };
}

describe("installable plugin host peer guardrails", () => {
  it("requires a non-optional openclaw peer floor for plugins that rely on new plugin-sdk subpaths", () => {
    for (const pluginId of INSTALLABLE_PLUGIN_IDS_REQUIRING_HOST_FLOOR) {
      const manifest = readPackageManifest(pluginId);
      expect(
        manifest.peerDependencies?.openclaw,
        `${pluginId} should declare an openclaw peer`,
      ).toBe(MIN_HOST_VERSION);
      expect(
        manifest.peerDependenciesMeta?.openclaw?.optional,
        `${pluginId} should not mark the openclaw peer optional`,
      ).not.toBe(true);
    }
  });
});
