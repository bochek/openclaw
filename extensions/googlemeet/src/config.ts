import {
  buildPluginConfigSchema,
  mapPluginConfigIssues,
  type OpenClawPluginConfigSchema,
  z,
} from "../api.js";

const GOOGLE_MEET_CLIENT_ID_KEYS = ["OPENCLAW_GOOGLE_MEET_CLIENT_ID", "GOOGLE_MEET_CLIENT_ID"];
const GOOGLE_MEET_CLIENT_SECRET_KEYS = [
  "OPENCLAW_GOOGLE_MEET_CLIENT_SECRET",
  "GOOGLE_MEET_CLIENT_SECRET",
] as const;
const GOOGLE_MEET_REFRESH_TOKEN_KEYS = [
  "OPENCLAW_GOOGLE_MEET_REFRESH_TOKEN",
  "GOOGLE_MEET_REFRESH_TOKEN",
] as const;
const GOOGLE_MEET_ACCESS_TOKEN_KEYS = [
  "OPENCLAW_GOOGLE_MEET_ACCESS_TOKEN",
  "GOOGLE_MEET_ACCESS_TOKEN",
] as const;
const GOOGLE_MEET_ACCESS_TOKEN_EXPIRES_AT_KEYS = [
  "OPENCLAW_GOOGLE_MEET_ACCESS_TOKEN_EXPIRES_AT",
  "GOOGLE_MEET_ACCESS_TOKEN_EXPIRES_AT",
] as const;
const GOOGLE_MEET_DEFAULT_MEETING_KEYS = [
  "OPENCLAW_GOOGLE_MEET_DEFAULT_MEETING",
  "GOOGLE_MEET_DEFAULT_MEETING",
] as const;
const GOOGLE_MEET_PREVIEW_ACK_KEYS = [
  "OPENCLAW_GOOGLE_MEET_PREVIEW_ACK",
  "GOOGLE_MEET_PREVIEW_ACK",
] as const;

export type GoogleMeetPluginConfig = {
  enabled?: boolean;
  defaults?: {
    meeting?: string;
  };
  preview?: {
    enrollmentAcknowledged?: boolean;
  };
  oauth?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
    expiresAt?: number;
  };
};

export type ResolvedGoogleMeetPluginConfig = {
  enabled: boolean;
  defaults: {
    meeting?: string;
  };
  preview: {
    enrollmentAcknowledged: boolean;
  };
  oauth: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
    expiresAt?: number;
  };
};

const GoogleMeetPluginConfigSource = z.strictObject({
  enabled: z.boolean().optional(),
  defaults: z
    .strictObject({
      meeting: z.string().optional(),
    })
    .optional(),
  preview: z
    .strictObject({
      enrollmentAcknowledged: z.boolean().optional(),
    })
    .optional(),
  oauth: z
    .strictObject({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      refreshToken: z.string().optional(),
      accessToken: z.string().optional(),
      expiresAt: z.number().finite().optional(),
    })
    .optional(),
});

function readEnvString(env: NodeJS.ProcessEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readEnvBoolean(env: NodeJS.ProcessEnv, keys: readonly string[]): boolean | undefined {
  const value = readEnvString(env, keys)?.toLowerCase();
  if (!value) {
    return undefined;
  }
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }
  return undefined;
}

function readEnvNumber(env: NodeJS.ProcessEnv, keys: readonly string[]): number | undefined {
  const value = readEnvString(env, keys);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const googleMeetPluginConfigSchema: OpenClawPluginConfigSchema = buildPluginConfigSchema(
  GoogleMeetPluginConfigSource,
  {
    safeParse(value: unknown) {
      const result = GoogleMeetPluginConfigSource.safeParse(value ?? {});
      if (result.success) {
        return { success: true, data: resolveGoogleMeetPluginConfig(result.data) };
      }
      return {
        success: false,
        error: {
          issues: mapPluginConfigIssues(result.error.issues),
        },
      };
    },
  },
);

export function resolveGoogleMeetPluginConfig(
  value: unknown,
  options?: { env?: NodeJS.ProcessEnv },
): ResolvedGoogleMeetPluginConfig {
  const env = options?.env ?? process.env;
  const parsed = GoogleMeetPluginConfigSource.safeParse(value ?? {});
  const raw = parsed.success ? parsed.data : {};
  return {
    enabled: raw.enabled ?? true,
    defaults: {
      meeting:
        normalizeOptionalString(raw.defaults?.meeting) ??
        readEnvString(env, GOOGLE_MEET_DEFAULT_MEETING_KEYS),
    },
    preview: {
      enrollmentAcknowledged:
        raw.preview?.enrollmentAcknowledged ??
        readEnvBoolean(env, GOOGLE_MEET_PREVIEW_ACK_KEYS) ??
        false,
    },
    oauth: {
      clientId:
        normalizeOptionalString(raw.oauth?.clientId) ??
        readEnvString(env, GOOGLE_MEET_CLIENT_ID_KEYS),
      clientSecret:
        normalizeOptionalString(raw.oauth?.clientSecret) ??
        readEnvString(env, GOOGLE_MEET_CLIENT_SECRET_KEYS),
      refreshToken:
        normalizeOptionalString(raw.oauth?.refreshToken) ??
        readEnvString(env, GOOGLE_MEET_REFRESH_TOKEN_KEYS),
      accessToken:
        normalizeOptionalString(raw.oauth?.accessToken) ??
        readEnvString(env, GOOGLE_MEET_ACCESS_TOKEN_KEYS),
      expiresAt:
        raw.oauth?.expiresAt ?? readEnvNumber(env, GOOGLE_MEET_ACCESS_TOKEN_EXPIRES_AT_KEYS),
    },
  };
}
