import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT_CHANNEL_ORDER } from "../channels/registry.js";

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    resolved.push(value);
  }
  return resolved;
}

let precomputedChannelOptions: string[] | null | undefined;
let readStartupMetadataFile = fs.readFileSync;

function loadPrecomputedChannelOptions(): string[] | null {
  if (precomputedChannelOptions !== undefined) {
    return precomputedChannelOptions;
  }
  try {
    const metadataPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "cli-startup-metadata.json",
    );
    const raw = readStartupMetadataFile(metadataPath, "utf8");
    const parsed = JSON.parse(raw) as { channelOptions?: unknown };
    if (Array.isArray(parsed.channelOptions)) {
      precomputedChannelOptions = dedupe(
        parsed.channelOptions.filter((value): value is string => typeof value === "string"),
      );
      return precomputedChannelOptions;
    }
  } catch {
    // Fall back to dynamic catalog resolution.
  }
  precomputedChannelOptions = null;
  return null;
}

export function resolveCliChannelOptions(): string[] {
  const precomputed = loadPrecomputedChannelOptions();
  return precomputed ?? [...CHAT_CHANNEL_ORDER];
}

export function formatCliChannelOptions(extra: string[] = []): string {
  return [...extra, ...resolveCliChannelOptions()].join("|");
}

export const __testing = {
  resetPrecomputedChannelOptionsForTests(): void {
    precomputedChannelOptions = undefined;
  },
  setReadStartupMetadataFileForTests(reader: typeof fs.readFileSync = fs.readFileSync): void {
    readStartupMetadataFile = reader;
    precomputedChannelOptions = undefined;
  },
};
