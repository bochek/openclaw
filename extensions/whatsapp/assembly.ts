import {
  defineBundledChannelEntry,
  defineBundledChannelSetupEntry,
} from "openclaw/plugin-sdk/channel-entry-contract";
import {
  createDelegatedSetupWizardProxy,
  type ChannelSetupWizard,
} from "openclaw/plugin-sdk/setup-runtime";
import { whatsappSetupWizardContract } from "./src/setup-contract.js";

type WhatsAppRuntimeAssembly = typeof import("./src/channel.runtime.js");
type WhatsAppSetupSurface = typeof import("./src/setup-surface.js");

export const whatsappAssembly = {
  id: "whatsapp",
  name: "WhatsApp",
  description: "WhatsApp channel plugin",
  manifest: {
    id: "whatsapp",
    channels: ["whatsapp"],
  },
  entry: {
    plugin: {
      specifier: "./channel-plugin-api.js",
      exportName: "whatsappPlugin",
    },
    runtime: {
      specifier: "./runtime-api.js",
      exportName: "setWhatsAppRuntime",
    },
  },
  setupEntry: {
    plugin: {
      specifier: "./setup-plugin-api.js",
      exportName: "whatsappSetupPlugin",
    },
  },
  package: {
    entrySources: ["./index.ts"],
    setupEntrySource: "./setup-entry.ts",
    channel: {
      id: "whatsapp",
      label: "WhatsApp",
      selectionLabel: "WhatsApp (QR link)",
      detailLabel: "WhatsApp Web",
      docsPath: "/channels/whatsapp",
      docsLabel: "whatsapp",
      blurb: "works with your own number; recommend a separate phone + eSIM.",
      systemImage: "message",
      persistedAuthState: {
        specifier: "./auth-presence",
        exportName: "hasAnyWhatsAppAuth",
      },
    },
    install: {
      npmSpec: "@openclaw/whatsapp",
    },
    packagedArtifacts: [
      "assembly.js",
      "auth-presence.js",
      "channel-plugin-api.js",
      "index.js",
      "light-runtime-api.js",
      "login-qr-runtime.js",
      "openclaw.plugin.json",
      "package.json",
      "runtime-api.js",
      "setup-entry.js",
      "setup-plugin-api.js",
    ],
  },
  runtime: {
    heavyExportNames: [
      "getActiveWebListener",
      "getWebAuthAgeMs",
      "logWebSelfId",
      "logoutWeb",
      "monitorWebChannel",
      "readWebSelfId",
      "startWebLoginWithQr",
      "waitForWebLogin",
      "webAuthExists",
      "loginWeb",
      "setWhatsAppRuntime",
    ],
    lightExportNames: [
      "createWhatsAppLoginTool",
      "formatError",
      "getActiveWebListener",
      "getStatusCode",
      "getWebAuthAgeMs",
      "logWebSelfId",
      "logoutWeb",
      "pickWebChannel",
      "readWebSelfId",
      "WA_WEB_AUTH_DIR",
      "webAuthExists",
    ],
  },
} as const;

let runtimeAssemblyPromise: Promise<WhatsAppRuntimeAssembly> | null = null;
let setupSurfacePromise: Promise<WhatsAppSetupSurface> | null = null;

export function loadWhatsAppChannelRuntime(): Promise<WhatsAppRuntimeAssembly> {
  runtimeAssemblyPromise ??= import("./src/channel.runtime.js");
  return runtimeAssemblyPromise;
}

export function loadWhatsAppSetupSurface(): Promise<WhatsAppSetupSurface> {
  setupSurfacePromise ??= import("./src/setup-surface.js");
  return setupSurfacePromise;
}

export const whatsappSetupWizardProxy = createDelegatedSetupWizardProxy({
  channel: whatsappSetupWizardContract.channel,
  loadWizard: async (): Promise<ChannelSetupWizard> =>
    (await loadWhatsAppSetupSurface()).whatsappSetupWizard,
  status: whatsappSetupWizardContract.status,
  resolveShouldPromptAccountIds: whatsappSetupWizardContract.resolveShouldPromptAccountIds,
  credentials: whatsappSetupWizardContract.credentials,
  delegateFinalize: true,
  disable: whatsappSetupWizardContract.disable,
  onAccountRecorded: whatsappSetupWizardContract.onAccountRecorded,
});

export function defineWhatsAppBundledChannelEntry(importMetaUrl: string) {
  return defineBundledChannelEntry({
    id: whatsappAssembly.id,
    name: whatsappAssembly.name,
    description: whatsappAssembly.description,
    importMetaUrl,
    plugin: whatsappAssembly.entry.plugin,
    runtime: whatsappAssembly.entry.runtime,
  });
}

export function defineWhatsAppBundledChannelSetupEntry(importMetaUrl: string) {
  return defineBundledChannelSetupEntry({
    importMetaUrl,
    plugin: whatsappAssembly.setupEntry.plugin,
  });
}
