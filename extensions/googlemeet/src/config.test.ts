import { describe, expect, it } from "vitest";
import { resolveGoogleMeetPluginConfig } from "./config.js";

describe("resolveGoogleMeetPluginConfig", () => {
  it("uses env fallbacks for OAuth and default meeting values", () => {
    const config = resolveGoogleMeetPluginConfig(
      {},
      {
        env: {
          GOOGLE_MEET_CLIENT_ID: "client-id",
          GOOGLE_MEET_CLIENT_SECRET: "client-secret",
          GOOGLE_MEET_REFRESH_TOKEN: "refresh-token",
          GOOGLE_MEET_ACCESS_TOKEN: "access-token",
          GOOGLE_MEET_ACCESS_TOKEN_EXPIRES_AT: "123456",
          GOOGLE_MEET_DEFAULT_MEETING: "https://meet.google.com/abc-defg-hij",
          GOOGLE_MEET_PREVIEW_ACK: "true",
        },
      },
    );

    expect(config).toMatchObject({
      enabled: true,
      defaults: {
        meeting: "https://meet.google.com/abc-defg-hij",
      },
      preview: {
        enrollmentAcknowledged: true,
      },
      oauth: {
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        accessToken: "access-token",
        expiresAt: 123456,
      },
    });
  });

  it("prefers explicit config over env values", () => {
    const config = resolveGoogleMeetPluginConfig(
      {
        defaults: {
          meeting: "spaces/jQCFfuBOdN5z",
        },
        preview: {
          enrollmentAcknowledged: false,
        },
        oauth: {
          clientId: "config-client",
          refreshToken: "config-refresh",
        },
      },
      {
        env: {
          GOOGLE_MEET_CLIENT_ID: "env-client",
          GOOGLE_MEET_REFRESH_TOKEN: "env-refresh",
          GOOGLE_MEET_PREVIEW_ACK: "true",
        },
      },
    );

    expect(config.defaults.meeting).toBe("spaces/jQCFfuBOdN5z");
    expect(config.preview.enrollmentAcknowledged).toBe(false);
    expect(config.oauth.clientId).toBe("config-client");
    expect(config.oauth.refreshToken).toBe("config-refresh");
  });
});
