import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasAnyWhatsAppAuth } from "./auth-presence.js";

const tempDirs: string[] = [];

function createIsolatedAuthEnv(rootDir: string): NodeJS.ProcessEnv {
  return {
    HOME: rootDir,
    USERPROFILE: rootDir,
    XDG_CONFIG_HOME: path.join(rootDir, ".config"),
  };
}

function writeCreds(authDir: string) {
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, "creds.json"), '{"me":{"id":"123@s.whatsapp.net"}}\n');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("whatsapp auth presence", () => {
  it("detects persisted auth from legacy root-level channel authDir", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-whatsapp-auth-root-"));
    tempDirs.push(tempRoot);
    const authDir = path.join(tempRoot, "legacy-auth");
    writeCreds(authDir);

    expect(
      hasAnyWhatsAppAuth(
        {
          channels: {
            whatsapp: {
              authDir,
            },
          },
        } as Parameters<typeof hasAnyWhatsAppAuth>[0],
        createIsolatedAuthEnv(tempRoot),
      ),
    ).toBe(true);
  });

  it("detects persisted auth from account-scoped authDir", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-whatsapp-auth-account-"));
    tempDirs.push(tempRoot);
    const authDir = path.join(tempRoot, "account-auth");
    writeCreds(authDir);

    expect(
      hasAnyWhatsAppAuth(
        {
          channels: {
            whatsapp: {
              defaultAccount: "work",
              accounts: {
                work: {
                  authDir,
                },
              },
            },
          },
        },
        createIsolatedAuthEnv(tempRoot),
      ),
    ).toBe(true);
  });
});
