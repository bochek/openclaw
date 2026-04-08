import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";

type ExecResult = {
  stdout: string;
  stderr: string;
};

export type KovaMultipassAvailability =
  | {
      available: true;
      binaryPath: string;
      version: string | null;
    }
  | {
      available: false;
      binaryPath: null;
      version: null;
    };

function execFileAsync(file: string, args: string[]) {
  return new Promise<ExecResult>((resolve, reject) => {
    execFile(file, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr.trim() || stdout.trim() || error.message;
        reject(new Error(message));
        return;
      }
      resolve({
        stdout,
        stderr,
      });
    });
  });
}

export async function resolveMultipassAvailability(): Promise<KovaMultipassAvailability> {
  try {
    const result = await execFileAsync("multipass", ["version"]);
    return {
      available: true,
      binaryPath: "multipass",
      version: result.stdout.trim() || result.stderr.trim(),
    };
  } catch {
    return {
      available: false,
      binaryPath: null,
      version: null,
    };
  }
}

export async function appendMultipassLog(logPath: string, message: string) {
  await appendFile(logPath, message, "utf8");
}

export async function runMultipassCommand(params: {
  binaryPath: string;
  logPath: string;
  args: string[];
}) {
  await appendMultipassLog(params.logPath, `$ ${[params.binaryPath, ...params.args].join(" ")}\n`);
  const result = await execFileAsync(params.binaryPath, params.args);
  if (result.stdout.trim()) {
    await appendMultipassLog(params.logPath, `${result.stdout.trim()}\n`);
  }
  if (result.stderr.trim()) {
    await appendMultipassLog(params.logPath, `${result.stderr.trim()}\n`);
  }
  await appendMultipassLog(params.logPath, "\n");
  return result;
}
