import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  defineWhatsAppBundledChannelEntry,
  defineWhatsAppBundledChannelSetupEntry,
} from "./assembly.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete (globalThis as { __openclawWhatsAppPackRuntime?: unknown }).__openclawWhatsAppPackRuntime;
});

describe("whatsapp packaged contract", () => {
  it("resolves packaged entry, setup, and runtime sidecars through the assembly contract", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-whatsapp-assembly-"));
    tempDirs.push(tempRoot);
    const pluginRoot = path.join(tempRoot, "dist", "extensions", "whatsapp");
    fs.mkdirSync(pluginRoot, { recursive: true });

    const entryPath = path.join(pluginRoot, "index.js");
    const setupEntryPath = path.join(pluginRoot, "setup-entry.js");
    fs.writeFileSync(entryPath, "export default {};\n", "utf8");
    fs.writeFileSync(setupEntryPath, "export default {};\n", "utf8");
    fs.writeFileSync(
      path.join(pluginRoot, "channel-plugin-api.js"),
      'export const whatsappPlugin = { id: "whatsapp" };\n',
      "utf8",
    );
    fs.writeFileSync(
      path.join(pluginRoot, "setup-plugin-api.js"),
      'export const whatsappSetupPlugin = { id: "whatsapp-setup" };\n',
      "utf8",
    );
    fs.writeFileSync(
      path.join(pluginRoot, "runtime-api.js"),
      [
        "export function setWhatsAppRuntime(runtime) {",
        "  globalThis.__openclawWhatsAppPackRuntime = runtime;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const packagedEntry = defineWhatsAppBundledChannelEntry(pathToFileURL(entryPath).href);
    const packagedSetupEntry = defineWhatsAppBundledChannelSetupEntry(
      pathToFileURL(setupEntryPath).href,
    );
    const runtime = { logger: "packaged-runtime" };

    expect(packagedEntry.loadChannelPlugin()).toEqual({ id: "whatsapp" });
    expect(packagedSetupEntry.loadSetupPlugin()).toEqual({ id: "whatsapp-setup" });
    packagedEntry.setChannelRuntime?.(runtime as never);
    expect(
      (globalThis as { __openclawWhatsAppPackRuntime?: unknown }).__openclawWhatsAppPackRuntime,
    ).toBe(runtime);
  });
});
