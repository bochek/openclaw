import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const listBootstrapChannelPlugins = vi.hoisted(() => vi.fn());

vi.mock("./plugins/bootstrap-registry.js", () => ({
  listBootstrapChannelPlugins,
}));

import {
  hasPotentialConfiguredChannels,
  listPotentialConfiguredChannelIds,
} from "./config-presence.js";

const tempDirs: string[] = [];

function makeTempStateDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-channel-config-presence-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  listBootstrapChannelPlugins.mockReset();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("config presence persisted auth", () => {
  it("ignores bootstrap plugin load failures while probing persisted auth state", () => {
    listBootstrapChannelPlugins.mockImplementation(() => {
      throw new Error("broken bootstrap plugin");
    });

    const env = {
      OPENCLAW_STATE_DIR: makeTempStateDir(),
    } as NodeJS.ProcessEnv;

    expect(listPotentialConfiguredChannelIds({}, env)).toEqual([]);
    expect(hasPotentialConfiguredChannels({}, env)).toBe(false);
  });
});
