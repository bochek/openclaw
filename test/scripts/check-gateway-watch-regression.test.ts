import { describe, expect, it } from "vitest";
import {
  hasGatewayReadyLog,
  listTreeEntries,
  snapshotTree,
  stripAnsi,
} from "../../scripts/check-gateway-watch-regression.mjs";

function createDirent(name: string, kind: "dir" | "file" | "symlink") {
  return {
    name,
    isDirectory: () => kind === "dir",
    isFile: () => kind === "file",
    isSymbolicLink: () => kind === "symlink",
  };
}

describe("check-gateway-watch-regression", () => {
  it("detects the gateway ready line even when logs are ANSI-colorized", () => {
    const line =
      "\u001b[90m2026-04-17T16:47:21.723+00:00\u001b[39m \u001b[36m[gateway]\u001b[39m \u001b[36mready (5 plugins: acpx; 1.8s)\u001b[39m";

    expect(stripAnsi(line)).toContain("[gateway] ready (5 plugins: acpx; 1.8s)");
    expect(hasGatewayReadyLog(line)).toBe(true);
  });

  it("keeps missing trees explicit in snapshot path listings", () => {
    const entries = listTreeEntries("dist-runtime", {
      cwd: "/repo",
      fs: {
        existsSync: () => false,
      },
    });

    expect(entries).toEqual(["dist-runtime (missing)"]);
  });

  it("ignores files that disappear between readdir and lstat while snapshotting", () => {
    const fakeFs = {
      existsSync(filePath: string) {
        return filePath === "/repo/dist";
      },
      readdirSync(filePath: string) {
        if (filePath === "/repo/dist") {
          return [createDirent("kept.js", "file"), createDirent("gone.js", "file")];
        }
        return [];
      },
      lstatSync(filePath: string) {
        if (filePath === "/repo/dist") {
          return {
            isDirectory: () => true,
            isFile: () => false,
            isSymbolicLink: () => false,
          };
        }
        if (filePath === "/repo/dist/kept.js") {
          return {
            size: 7,
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
          };
        }
        const error = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      },
    };

    expect(snapshotTree("dist", { cwd: "/repo", fs: fakeFs })).toEqual({
      exists: true,
      files: 1,
      directories: 1,
      symlinks: 0,
      entries: 2,
      apparentBytes: 7,
    });
  });
});
