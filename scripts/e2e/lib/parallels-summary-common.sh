#!/usr/bin/env bash

parallels_seed_fresh_child_summary() {
  local prefix="$1"
  local discord_status="skip"
  if discord_smoke_enabled; then
    discord_status="fail"
  fi
  eval "${prefix}_GATEWAY_STATUS='fail'"
  eval "${prefix}_PERMISSION_STATUS='fail'"
  eval "${prefix}_CHANNELS_STATUS='fail'"
  eval "${prefix}_DASHBOARD_STATUS='fail'"
  eval "${prefix}_AGENT_STATUS='fail'"
  eval "${prefix}_DISCORD_STATUS='${discord_status}'"
}

parallels_load_fresh_child_summary() {
  local prefix="$1"
  local log_path="$2"
  [[ -f "$log_path" ]] || return 0

  local assignments
  set +e
  assignments="$(
    PREFIX="$prefix" "$PYTHON_BIN" - "$log_path" <<'PY'
import json
import os
import pathlib
import shlex
import sys

prefix = os.environ["PREFIX"]
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace").strip()
if not text:
    raise SystemExit(0)

try:
    payload = json.loads(text)
except Exception:
    decoder = json.JSONDecoder()
    payload = None
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            candidate, _ = decoder.raw_decode(text[index:])
        except Exception:
            continue
        if isinstance(candidate, dict) and isinstance(candidate.get("freshMain"), dict):
            payload = candidate
    if payload is None:
        raise SystemExit(0)

fresh = payload.get("freshMain")
if not isinstance(fresh, dict):
    raise SystemExit(0)

fields = {
    "STATUS": fresh.get("status", "skip"),
    "VERSION": fresh.get("version", "skip"),
    "GATEWAY_STATUS": fresh.get("gateway", "skip"),
    "PERMISSION_STATUS": fresh.get("permissions", "skip"),
    "CHANNELS_STATUS": fresh.get("channels", "skip"),
    "DASHBOARD_STATUS": fresh.get("dashboard", "skip"),
    "AGENT_STATUS": fresh.get("agent", "skip"),
    "DISCORD_STATUS": fresh.get("discord", "skip"),
}

for key, value in fields.items():
    if not isinstance(value, str):
        value = "skip"
    print(f"{prefix}_{key}={shlex.quote(value)}")
PY
  )"
  local rc=$?
  set -e
  if [[ $rc -eq 0 && -n "$assignments" ]]; then
    eval "$assignments"
  fi
}

parallels_update_status_path() {
  local run_dir="$1"
  local os_name="$2"
  printf '%s/%s-update-status.json\n' "$run_dir" "$os_name"
}

parallels_write_update_status_summary() {
  local run_dir="$1"
  local os_name="$2"
  local gateway_status="$3"
  local permission_status="$4"
  local channels_status="$5"
  local dashboard_status="$6"
  local agent_status="$7"
  local discord_status="$8"
  local status_path
  status_path="$(parallels_update_status_path "$run_dir" "$os_name")"
  UPDATE_STATUS_PATH="$status_path" \
  UPDATE_GATEWAY_STATUS="$gateway_status" \
  UPDATE_PERMISSION_STATUS="$permission_status" \
  UPDATE_CHANNELS_STATUS="$channels_status" \
  UPDATE_DASHBOARD_STATUS="$dashboard_status" \
  UPDATE_AGENT_STATUS="$agent_status" \
  UPDATE_DISCORD_STATUS="$discord_status" \
    "$PYTHON_BIN" - <<'PY'
import json
import os

payload = {
    "gateway": os.environ["UPDATE_GATEWAY_STATUS"],
    "permissions": os.environ["UPDATE_PERMISSION_STATUS"],
    "channels": os.environ["UPDATE_CHANNELS_STATUS"],
    "dashboard": os.environ["UPDATE_DASHBOARD_STATUS"],
    "agent": os.environ["UPDATE_AGENT_STATUS"],
    "discord": os.environ["UPDATE_DISCORD_STATUS"],
}
with open(os.environ["UPDATE_STATUS_PATH"], "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
PY
}

parallels_seed_update_status_summary() {
  local run_dir="$1"
  local os_name="$2"
  local discord_status="skip"
  if discord_smoke_enabled; then
    discord_status="fail"
  fi
  parallels_write_update_status_summary "$run_dir" "$os_name" "fail" "fail" "fail" "fail" "fail" "$discord_status"
}

parallels_load_update_status_summary() {
  local prefix="$1"
  local status_path="$2"
  [[ -f "$status_path" ]] || return 0

  local assignments
  set +e
  assignments="$(
    PREFIX="$prefix" "$PYTHON_BIN" - "$status_path" <<'PY'
import json
import os
import pathlib
import shlex
import sys

prefix = os.environ["PREFIX"]
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace").strip()
if not text:
    raise SystemExit(0)

try:
    payload = json.loads(text)
except Exception:
    raise SystemExit(0)

fields = {
    "GATEWAY_STATUS": payload.get("gateway", "skip"),
    "PERMISSION_STATUS": payload.get("permissions", "skip"),
    "CHANNELS_STATUS": payload.get("channels", "skip"),
    "DASHBOARD_STATUS": payload.get("dashboard", "skip"),
    "AGENT_STATUS": payload.get("agent", "skip"),
    "DISCORD_STATUS": payload.get("discord", "skip"),
}

for key, value in fields.items():
    if not isinstance(value, str):
        value = "skip"
    print(f"{prefix}_{key}={shlex.quote(value)}")
PY
  )"
  local rc=$?
  set -e
  if [[ $rc -eq 0 && -n "$assignments" ]]; then
    eval "$assignments"
  fi
}
