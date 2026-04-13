import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { listBundledPluginPackArtifacts } from "../../scripts/lib/bundled-plugin-build-entries.mjs";
import { assertBundledChannelEntries } from "../../test/helpers/bundled-channel-entry.ts";
import {
  defineWhatsAppBundledChannelEntry,
  defineWhatsAppBundledChannelSetupEntry,
} from "./assembly.js";
import { whatsappAssembly } from "./assembly.js";
import entry from "./index.js";
import * as lightRuntimeAssembly from "./light-runtime-api.js";
import * as runtimeAssembly from "./runtime-api.js";
import setupEntry from "./setup-entry.js";
import { whatsappPlugin } from "./src/channel.js";
import { whatsappSetupPlugin } from "./src/channel.setup.js";
import { getWhatsAppRuntime } from "./src/runtime.js";

describe("whatsapp bundled entries", () => {
  assertBundledChannelEntries({
    entry,
    expectedId: "whatsapp",
    expectedName: "WhatsApp",
    setupEntry,
  });

  it("keeps entry wrappers and package metadata delegated through the assembly owner", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"),
    );
    const indexSource = fs.readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const setupEntrySource = fs.readFileSync(new URL("./setup-entry.ts", import.meta.url), "utf8");
    const runtimeApiSource = fs.readFileSync(new URL("./runtime-api.ts", import.meta.url), "utf8");
    const lightRuntimeApiSource = fs.readFileSync(
      new URL("./light-runtime-api.ts", import.meta.url),
      "utf8",
    );

    expect(indexSource).toContain("defineWhatsAppBundledChannelEntry(import.meta.url)");
    expect(setupEntrySource).toContain("defineWhatsAppBundledChannelSetupEntry(import.meta.url)");
    expect(runtimeApiSource).toContain('from "./src/runtime-api.js"');
    expect(lightRuntimeApiSource).toContain('from "./src/light-runtime-api.js"');
    expect(entry.id).toBe(whatsappAssembly.id);
    expect(entry.name).toBe(whatsappAssembly.name);
    expect(packageJson.openclaw.extensions).toEqual([...whatsappAssembly.package.entrySources]);
    expect(packageJson.openclaw.setupEntry).toBe(whatsappAssembly.package.setupEntrySource);
    expect(packageJson.openclaw.channel.persistedAuthState).toEqual(
      whatsappAssembly.package.persistedAuthState,
    );
  });

  it("packs the required WhatsApp assembly artifacts", () => {
    const artifacts = listBundledPluginPackArtifacts();

    for (const artifact of whatsappAssembly.package.packagedArtifacts) {
      expect(artifacts).toContain(`dist/extensions/whatsapp/${artifact}`);
    }
  });

  it("exercises the real bundled entry sidecars for plugin load and runtime registration", () => {
    const runtime = { logger: "runtime" };
    const entryContract = defineWhatsAppBundledChannelEntry(import.meta.url);
    const setupEntryContract = defineWhatsAppBundledChannelSetupEntry(import.meta.url);

    expect(entryContract.loadChannelPlugin()).toBe(whatsappPlugin);
    entryContract.setChannelRuntime?.(runtime as never);
    expect(setupEntryContract.loadSetupPlugin()).toBe(whatsappSetupPlugin);
    expect(getWhatsAppRuntime()).toBe(runtime);
  });

  it("keeps gateway startup and login exports on the shared heavy runtime assembly surface", () => {
    for (const exportName of whatsappAssembly.runtime.heavyExportNames) {
      expect(runtimeAssembly).toHaveProperty(exportName);
    }
  });

  it("keeps the light runtime assembly on the lightweight surface only", () => {
    for (const exportName of whatsappAssembly.runtime.lightExportNames) {
      expect(lightRuntimeAssembly).toHaveProperty(exportName);
    }
    expect(lightRuntimeAssembly).not.toHaveProperty("monitorWebChannel");
    expect(lightRuntimeAssembly).not.toHaveProperty("startWebLoginWithQr");
  });
});
