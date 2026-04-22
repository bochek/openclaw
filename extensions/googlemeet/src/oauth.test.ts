import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_MEET_SCOPES,
  buildGoogleMeetAuthUrl,
  refreshGoogleMeetAccessToken,
  resolveGoogleMeetAccessToken,
  shouldUseCachedGoogleMeetAccessToken,
} from "./oauth.js";

describe("buildGoogleMeetAuthUrl", () => {
  it("includes the required Meet Media scopes and PKCE fields", () => {
    const url = new URL(
      buildGoogleMeetAuthUrl({
        clientId: "client-id",
        challenge: "challenge",
        state: "state",
      }),
    );

    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_MEET_SCOPES.join(" "));
  });
});

describe("refreshGoogleMeetAccessToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a refresh-token grant and parses the response", async () => {
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("client_id")).toBe("client-id");
      expect(body.get("refresh_token")).toBe("refresh-token");
      return new Response(
        JSON.stringify({
          access_token: "next-access-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await refreshGoogleMeetAccessToken({
      clientId: "client-id",
      refreshToken: "refresh-token",
    });

    expect(tokens.accessToken).toBe("next-access-token");
    expect(tokens.tokenType).toBe("Bearer");
  });

  it("prefers a fresh cached access token before refresh", async () => {
    const resolved = await resolveGoogleMeetAccessToken({
      accessToken: "cached-token",
      expiresAt: Date.now() + 120_000,
    });

    expect(resolved).toEqual({
      accessToken: "cached-token",
      expiresAt: expect.any(Number),
      refreshed: false,
    });
    expect(
      shouldUseCachedGoogleMeetAccessToken({
        accessToken: "cached-token",
        expiresAt: Date.now() + 120_000,
      }),
    ).toBe(true);
  });
});
