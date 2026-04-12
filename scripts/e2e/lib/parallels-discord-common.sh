#!/usr/bin/env bash

discord_python_bin() {
  if [[ -n "${PYTHON_BIN:-}" ]]; then
    printf '%s\n' "$PYTHON_BIN"
    return
  fi
  command -v python3
}

discord_smoke_enabled() {
  [[ -n "${DISCORD_TOKEN_VALUE:-}" && -n "${DISCORD_GUILD_ID:-}" && -n "${DISCORD_CHANNEL_ID:-}" ]]
}

discord_api_request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  local url="https://discord.com/api/v10$path"
  if [[ -n "$payload" ]]; then
    curl -fsS -X "$method" \
      -H "Authorization: Bot $DISCORD_TOKEN_VALUE" \
      -H "Content-Type: application/json" \
      --data "$payload" \
      "$url"
    return
  fi
  curl -fsS -X "$method" \
    -H "Authorization: Bot $DISCORD_TOKEN_VALUE" \
    "$url"
}

json_contains_string() {
  local needle="$1"
  "$(discord_python_bin)" - "$needle" <<'PY'
import json
import sys

needle = sys.argv[1]
try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)

def contains(value):
    if isinstance(value, str):
        return needle in value
    if isinstance(value, list):
        return any(contains(item) for item in value)
    if isinstance(value, dict):
        return any(contains(item) for item in value.values())
    return False

raise SystemExit(0 if contains(payload) else 1)
PY
}

build_discord_guilds_json() {
  DISCORD_GUILD_ID="$DISCORD_GUILD_ID" DISCORD_CHANNEL_ID="$DISCORD_CHANNEL_ID" "$(discord_python_bin)" - <<'PY'
import json
import os

print(
    json.dumps(
        {
            os.environ["DISCORD_GUILD_ID"]: {
                "channels": {
                    os.environ["DISCORD_CHANNEL_ID"]: {
                        "allow": True,
                        "requireMention": False,
                    }
                }
            }
        }
    )
)
PY
}

discord_message_id_from_send_log() {
  local path="$1"
  "$(discord_python_bin)" - "$path" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text())
message_id = payload.get("payload", {}).get("messageId")
if not message_id:
    message_id = payload.get("payload", {}).get("result", {}).get("messageId")
if not message_id:
    raise SystemExit("messageId missing from send output")
print(message_id)
PY
}

wait_for_discord_host_visibility() {
  local nonce="$1"
  local timeout_s="${2:-${TIMEOUT_DISCORD_S:-180}}"
  local response
  local deadline=$((SECONDS + timeout_s))
  while (( SECONDS < deadline )); do
    set +e
    response="$(discord_api_request GET "/channels/$DISCORD_CHANNEL_ID/messages?limit=20")"
    local rc=$?
    set -e
    if [[ $rc -eq 0 ]] && [[ -n "$response" ]] && printf '%s' "$response" | json_contains_string "$nonce"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

post_host_discord_message() {
  local nonce="$1"
  local prefix_or_id_file="$2"
  local maybe_id_file="${3:-}"
  local prefix id_file payload response
  if [[ -n "$maybe_id_file" ]]; then
    prefix="$prefix_or_id_file"
    id_file="$maybe_id_file"
  else
    prefix="parallels-smoke"
    id_file="$prefix_or_id_file"
  fi
  payload="$(
    NONCE="$nonce" PREFIX="$prefix" "$(discord_python_bin)" - <<'PY'
import json
import os

print(
    json.dumps(
        {
            "content": f"{os.environ['PREFIX']}-inbound-{os.environ['NONCE']}",
            "flags": 4096,
        }
    )
)
PY
  )"
  response="$(discord_api_request POST "/channels/$DISCORD_CHANNEL_ID/messages" "$payload")"
  printf '%s' "$response" | "$(discord_python_bin)" - "$id_file" <<'PY'
import json
import pathlib
import sys

payload = json.load(sys.stdin)
message_id = payload.get("id")
if not isinstance(message_id, str) or not message_id:
    raise SystemExit("host Discord post missing message id")
pathlib.Path(sys.argv[1]).write_text(f"{message_id}\n", encoding="utf-8")
PY
}

discord_delete_message_id_file() {
  local path="$1"
  [[ -f "$path" ]] || return 0
  [[ -s "$path" ]] || return 0
  discord_smoke_enabled || return 0

  local message_id
  message_id="$(tr -d '\r\n' <"$path")"
  [[ -n "$message_id" ]] || return 0

  set +e
  discord_api_request DELETE "/channels/$DISCORD_CHANNEL_ID/messages/$message_id" >/dev/null
  set -e
}

cleanup_discord_message_files() {
  local path
  discord_smoke_enabled || return 0
  for path in "$@"; do
    discord_delete_message_id_file "$path"
  done
}
