import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

type ChromeUserDataDirRef = {
  dir: string;
};

export function installChromeUserDataDirHooks(chromeUserDataDir: ChromeUserDataDirRef): void {
  chromeUserDataDir.dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-chrome-user-data-"));

  afterAll(() => {
    fs.rmSync(chromeUserDataDir.dir, { recursive: true, force: true });
  });
}
