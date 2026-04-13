import path from "node:path";
import { pathExists, type OpenClawConfig } from "openclaw/plugin-sdk/setup";
import { resolveWhatsAppAuthDir } from "./accounts.js";

export async function detectWhatsAppLinked(
  cfg: OpenClawConfig,
  accountId: string,
): Promise<boolean> {
  const { authDir } = resolveWhatsAppAuthDir({ cfg, accountId });
  const credsPath = path.join(authDir, "creds.json");
  return await pathExists(credsPath);
}
