# Plugin SDK bundled parity tracker

## Phase 0 baseline

Collected on 2026-03-03 (local dev machine) before this migration wave.

| scenario                   | load time ms | rss delta MiB | loaded plugins |
| -------------------------- | -----------: | ------------: | -------------: |
| default-bundled-enable-set |     90004.13 |       1065.53 |              4 |
| telegram-only              |       158.80 |          0.00 |              5 |
| discord-only               |        56.40 |          0.22 |              5 |
| slack-only                 |        46.68 |          0.00 |              5 |

## Phase 3 rerun after migration

Collected on 2026-03-03 after subpath wiring + bundled entrypoint migration.

| scenario                   | load time ms | rss delta MiB | loaded plugins |
| -------------------------- | -----------: | ------------: | -------------: |
| default-bundled-enable-set |      1564.07 |         95.09 |              4 |
| telegram-only              |      1539.78 |         33.33 |              5 |
| discord-only               |      5341.77 |         17.11 |              5 |
| slack-only                 |       370.49 |          4.78 |              5 |

Notes:

- These local numbers are noisy and order-dependent.
- Keep CI or repeated local medians as the source of truth for hard budgets.

## Bundled plugin inventory and migration status

Status legend:

- `channel-subpath`: imports `openclaw/plugin-sdk/<channel>`
- `core-entrypoint`: entrypoint imports `openclaw/plugin-sdk/core`
- `no-sdk-import`: entrypoint does not import plugin-sdk

`channel-subpath` (7):
`discord`, `imessage`, `line`, `signal`, `slack`, `telegram`, `whatsapp`

`core-entrypoint` (28):
`acpx`, `bluebubbles`, `copilot-proxy`, `device-pair`, `diagnostics-otel`, `diffs`, `feishu`,
`google-gemini-cli-auth`, `googlechat`, `irc`, `matrix`, `mattermost`, `memory-core`,
`memory-lancedb`, `minimax-portal-auth`, `msteams`, `nextcloud-talk`, `nostr`, `phone-control`,
`qwen-portal-auth`, `synology-chat`, `talk-voice`, `thread-ownership`, `tlon`, `twitch`,
`voice-call`, `zalo`, `zalouser`

`no-sdk-import` (3):
`llm-task`, `lobster`, `open-prose`

Deferred (future wave):

- Non-entrypoint bundled plugin internals that still import monolithic
  `openclaw/plugin-sdk` (for example Matrix, Feishu, MSTeams, Zalo, Zalouser,
  Twitch, Tlon, and related tests/runtime files).
