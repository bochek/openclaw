import { execFile } from "node:child_process";

function execGit(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    execFile("git", args, { cwd, encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function resolveGitCommit(repoRoot: string) {
  try {
    return await execGit(["rev-parse", "--short", "HEAD"], repoRoot);
  } catch {
    return undefined;
  }
}

export async function resolveGitDirty(repoRoot: string) {
  try {
    const output = await execGit(["status", "--porcelain"], repoRoot);
    return output.length > 0;
  } catch {
    return false;
  }
}
