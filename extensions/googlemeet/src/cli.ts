import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import type { ResolvedGoogleMeetPluginConfig } from "./config.js";
import { fetchGoogleMeetSpace, buildGoogleMeetPreflightReport } from "./meet.js";
import {
  buildGoogleMeetAuthUrl,
  createGoogleMeetOAuthState,
  createGoogleMeetPkce,
  exchangeGoogleMeetAuthCode,
  resolveGoogleMeetAccessToken,
  waitForGoogleMeetAuthCode,
} from "./oauth.js";

type GoogleMeetCliRegistrationParams = {
  program: Command;
  pluginConfig: ResolvedGoogleMeetPluginConfig;
};

type OAuthLoginOptions = {
  clientId?: string;
  clientSecret?: string;
  manual?: boolean;
  json?: boolean;
  timeoutSec?: string;
};

type ResolveSpaceOptions = {
  meeting?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  expiresAt?: string;
  json?: boolean;
};

type PreflightOptions = ResolveSpaceOptions;

function writeLine(message: string): void {
  process.stdout.write(message.endsWith("\n") ? message : `${message}\n`);
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function promptInput(message: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a numeric value, received ${value}`);
  }
  return parsed;
}

function resolveTokenOptions(
  pluginConfig: ResolvedGoogleMeetPluginConfig,
  options: ResolveSpaceOptions,
): {
  meeting: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
} {
  const meeting = options.meeting?.trim() || pluginConfig.defaults.meeting;
  if (!meeting) {
    throw new Error("Meeting input is required. Pass --meeting or configure defaults.meeting.");
  }
  return {
    meeting,
    clientId: options.clientId?.trim() || pluginConfig.oauth.clientId,
    clientSecret: options.clientSecret?.trim() || pluginConfig.oauth.clientSecret,
    refreshToken: options.refreshToken?.trim() || pluginConfig.oauth.refreshToken,
    accessToken: options.accessToken?.trim() || pluginConfig.oauth.accessToken,
    expiresAt: parseOptionalNumber(options.expiresAt) ?? pluginConfig.oauth.expiresAt,
  };
}

export function registerGoogleMeetCli(params: GoogleMeetCliRegistrationParams): void {
  const root = params.program
    .command("googlemeet")
    .description("Google Meet OAuth and media preflight helpers")
    .addHelpText(
      "after",
      () =>
        "\nDocs: https://docs.openclaw.ai/plugins/googlemeet\n\nThis plugin currently ships OAuth + preflight groundwork. Live media capture is a follow-up.\n",
    );

  const auth = root.command("auth").description("Google Meet OAuth helpers");

  auth
    .command("login")
    .description("Run a PKCE OAuth flow and print refresh-token JSON to store in plugin config")
    .option("--client-id <id>", "OAuth client id override")
    .option("--client-secret <secret>", "OAuth client secret override")
    .option("--manual", "Use copy/paste callback flow instead of localhost callback")
    .option("--json", "Print the token payload as JSON", false)
    .option("--timeout-sec <n>", "Local callback timeout in seconds", "300")
    .action(async (options: OAuthLoginOptions) => {
      const clientId = options.clientId?.trim() || params.pluginConfig.oauth.clientId;
      const clientSecret = options.clientSecret?.trim() || params.pluginConfig.oauth.clientSecret;
      if (!clientId) {
        throw new Error(
          "Missing Google Meet OAuth client id. Configure oauth.clientId or pass --client-id.",
        );
      }
      const { verifier, challenge } = createGoogleMeetPkce();
      const state = createGoogleMeetOAuthState();
      const authUrl = buildGoogleMeetAuthUrl({
        clientId,
        challenge,
        state,
      });
      const code = await waitForGoogleMeetAuthCode({
        state,
        manual: Boolean(options.manual),
        timeoutMs: (parseOptionalNumber(options.timeoutSec) ?? 300) * 1000,
        authUrl,
        promptInput,
        writeLine,
      });
      const tokens = await exchangeGoogleMeetAuthCode({
        clientId,
        clientSecret,
        code,
        verifier,
      });
      const payload = {
        oauth: {
          clientId,
          ...(clientSecret ? { clientSecret } : {}),
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
          expiresAt: tokens.expiresAt,
        },
        scope: tokens.scope,
        tokenType: tokens.tokenType,
      };
      if (!tokens.refreshToken) {
        throw new Error(
          "Google OAuth did not return a refresh token. Re-run the flow with consent and offline access.",
        );
      }
      if (options.json) {
        writeJson(payload);
        return;
      }
      writeLine("Paste this into plugins.entries.googlemeet.config:");
      writeJson(payload);
    });

  root
    .command("resolve-space")
    .description("Resolve a Meet URL, meeting code, or spaces/{id} to its canonical space")
    .option("--meeting <value>", "Meet URL, meeting code, or spaces/{id}")
    .option("--access-token <token>", "Access token override")
    .option("--refresh-token <token>", "Refresh token override")
    .option("--client-id <id>", "OAuth client id override")
    .option("--client-secret <secret>", "OAuth client secret override")
    .option("--expires-at <ms>", "Cached access token expiry as unix epoch milliseconds")
    .option("--json", "Print JSON output", false)
    .action(async (options: ResolveSpaceOptions) => {
      const resolved = resolveTokenOptions(params.pluginConfig, options);
      const token = await resolveGoogleMeetAccessToken(resolved);
      const space = await fetchGoogleMeetSpace({
        accessToken: token.accessToken,
        meeting: resolved.meeting,
      });
      if (options.json) {
        writeJson(space);
        return;
      }
      writeLine(`input: ${resolved.meeting}`);
      writeLine(`space: ${space.name}`);
      if (space.meetingCode) {
        writeLine(`meeting code: ${space.meetingCode}`);
      }
      if (space.meetingUri) {
        writeLine(`meeting uri: ${space.meetingUri}`);
      }
      writeLine(`active conference: ${space.activeConference ? "yes" : "no"}`);
      writeLine(`token source: ${token.refreshed ? "refresh-token" : "cached-access-token"}`);
    });

  root
    .command("preflight")
    .description("Validate OAuth + meeting resolution prerequisites for future media ingest")
    .option("--meeting <value>", "Meet URL, meeting code, or spaces/{id}")
    .option("--access-token <token>", "Access token override")
    .option("--refresh-token <token>", "Refresh token override")
    .option("--client-id <id>", "OAuth client id override")
    .option("--client-secret <secret>", "OAuth client secret override")
    .option("--expires-at <ms>", "Cached access token expiry as unix epoch milliseconds")
    .option("--json", "Print JSON output", false)
    .action(async (options: PreflightOptions) => {
      const resolved = resolveTokenOptions(params.pluginConfig, options);
      const token = await resolveGoogleMeetAccessToken(resolved);
      const space = await fetchGoogleMeetSpace({
        accessToken: token.accessToken,
        meeting: resolved.meeting,
      });
      const report = buildGoogleMeetPreflightReport({
        input: resolved.meeting,
        space,
        previewAcknowledged: params.pluginConfig.preview.enrollmentAcknowledged,
        tokenSource: token.refreshed ? "refresh-token" : "cached-access-token",
      });
      if (options.json) {
        writeJson(report);
        return;
      }
      writeLine(`input: ${report.input}`);
      writeLine(`resolved space: ${report.resolvedSpaceName}`);
      if (report.meetingCode) {
        writeLine(`meeting code: ${report.meetingCode}`);
      }
      if (report.meetingUri) {
        writeLine(`meeting uri: ${report.meetingUri}`);
      }
      writeLine(`active conference: ${report.hasActiveConference ? "yes" : "no"}`);
      writeLine(`preview acknowledged: ${report.previewAcknowledged ? "yes" : "no"}`);
      writeLine(`token source: ${report.tokenSource}`);
      if (report.blockers.length === 0) {
        writeLine("blockers: none");
        return;
      }
      writeLine("blockers:");
      for (const blocker of report.blockers) {
        writeLine(`- ${blocker}`);
      }
    });
}
