import { setSetupChannelEnabled, type ChannelSetupWizard } from "openclaw/plugin-sdk/setup";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/setup";
import { listWhatsAppAccountIds } from "./accounts.js";
import { detectWhatsAppLinked } from "./setup-status.js";

// Keep setup-only proxy metadata centralized here so assembly.ts and
// setup-surface.ts do not curate separate copies of the same contract.
export const WHATSAPP_SETUP_CHANNEL = "whatsapp" as const;

export const whatsappSetupWizardStatus = {
  configuredLabel: "linked",
  unconfiguredLabel: "not linked",
  configuredHint: "linked",
  unconfiguredHint: "not linked",
  configuredScore: 5,
  unconfiguredScore: 4,
  resolveConfigured: async ({
    cfg,
    accountId,
  }: Parameters<ChannelSetupWizard["status"]["resolveConfigured"]>[0]) => {
    for (const resolvedAccountId of accountId ? [accountId] : listWhatsAppAccountIds(cfg)) {
      if (await detectWhatsAppLinked(cfg, resolvedAccountId || DEFAULT_ACCOUNT_ID)) {
        return true;
      }
    }
    return false;
  },
} satisfies Omit<
  ChannelSetupWizard["status"],
  "resolveStatusLines" | "resolveSelectionHint" | "resolveQuickstartScore"
>;

export const whatsappSetupWizardContract = {
  channel: WHATSAPP_SETUP_CHANNEL,
  status: whatsappSetupWizardStatus,
  resolveShouldPromptAccountIds: ({ shouldPromptAccountIds }) => shouldPromptAccountIds,
  credentials: [] satisfies ChannelSetupWizard["credentials"],
  disable: (cfg: Parameters<NonNullable<ChannelSetupWizard["disable"]>>[0]) =>
    setSetupChannelEnabled(cfg, WHATSAPP_SETUP_CHANNEL, false),
  onAccountRecorded: (
    accountId: string,
    options?: Parameters<NonNullable<ChannelSetupWizard["onAccountRecorded"]>>[1],
  ) => {
    options?.onAccountId?.(WHATSAPP_SETUP_CHANNEL, accountId);
  },
} satisfies Pick<
  ChannelSetupWizard,
  | "channel"
  | "status"
  | "resolveShouldPromptAccountIds"
  | "credentials"
  | "disable"
  | "onAccountRecorded"
>;
