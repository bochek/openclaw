---
summary: "Google Meet plugin: experimental OAuth + meeting preflight groundwork for future Meet Media API audio ingest"
read_when:
  - You want to prepare OpenClaw for Google Meet Media API audio ingest
  - You are configuring or developing the googlemeet plugin
title: "Google Meet Plugin"
---

# Google Meet (plugin)

Experimental groundwork for Google Meet Media API audio ingest.

Current scope:

- OAuth login helper for a Google user account
- access-token refresh from a stored refresh token
- meeting-space resolution from a Meet URL, meeting code, or `spaces/{id}`
- preflight checks for future media-ingest sessions

Current non-scope:

- live audio capture
- in-call Meet chat capture
- automatic headless browser media bridge

That split is deliberate. Google’s Meet Media API currently exposes a browser or
native-client media surface, so this first plugin release lands the control
plane first instead of pretending the audio path is finished.

## Prerequisites

- A Google Cloud OAuth client that can mint **user** tokens.
- Redirect URI: `http://localhost:8085/oauth2callback`
- Google Meet Media API preview enrollment for:
  - your Google Cloud project
  - the OAuth principal you sign in as
  - the meeting participants you want to test with

The plugin currently expects these OAuth scopes:

- `https://www.googleapis.com/auth/meetings.space.readonly`
- `https://www.googleapis.com/auth/meetings.conference.media.readonly`

## Config

Configure under `plugins.entries.googlemeet.config`:

```json5
{
  plugins: {
    entries: {
      googlemeet: {
        enabled: true,
        config: {
          defaults: {
            meeting: "https://meet.google.com/abc-defg-hij",
          },
          preview: {
            enrollmentAcknowledged: true,
          },
          oauth: {
            clientId: "1234567890-abc.apps.googleusercontent.com",
            clientSecret: "GOCSPX-...",
            refreshToken: "1//0g...",
          },
        },
      },
    },
  },
}
```

Environment fallbacks are also supported:

- `GOOGLE_MEET_CLIENT_ID`
- `GOOGLE_MEET_CLIENT_SECRET`
- `GOOGLE_MEET_REFRESH_TOKEN`
- `GOOGLE_MEET_ACCESS_TOKEN`
- `GOOGLE_MEET_ACCESS_TOKEN_EXPIRES_AT`
- `GOOGLE_MEET_DEFAULT_MEETING`
- `GOOGLE_MEET_PREVIEW_ACK`

`OPENCLAW_GOOGLE_MEET_*` variants are accepted too.

## OAuth login

If you do not have a refresh token yet:

```bash
openclaw googlemeet auth login --client-id "$GOOGLE_MEET_CLIENT_ID" --client-secret "$GOOGLE_MEET_CLIENT_SECRET"
```

The command prints a JSON payload you can paste into
`plugins.entries.googlemeet.config`.

For remote shells or locked-down hosts, use manual mode:

```bash
openclaw googlemeet auth login --manual --client-id "$GOOGLE_MEET_CLIENT_ID"
```

## Resolve a meeting

Resolve a Meet URL or meeting code to its canonical space:

```bash
openclaw googlemeet resolve-space --meeting https://meet.google.com/pdq-bixx-kjf
```

The command accepts:

- full Meet URLs
- meeting codes like `pdq-bixx-kjf`
- canonical names like `spaces/jQCFfuBOdN5z`

## Preflight

Run a control-plane preflight before building or testing media capture:

```bash
openclaw googlemeet preflight --meeting https://meet.google.com/pdq-bixx-kjf
```

This checks:

- OAuth token resolution
- `spaces.get` access to the target meeting
- canonical meeting-space resolution
- whether you acknowledged the preview-only requirement in config

It does **not** guarantee live media ingest will succeed. The remaining data
plane still depends on Google’s Developer Preview gating and a future browser
capture layer.
