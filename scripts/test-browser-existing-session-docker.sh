#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${OPENCLAW_BROWSER_SMOKE_IMAGE:-${CLAWDBOT_BROWSER_SMOKE_IMAGE:-openclaw-browser-mcp-smoke:local}}"
SKIP_IMAGE_BUILD="${OPENCLAW_BROWSER_SMOKE_SKIP_IMAGE_BUILD:-${CLAWDBOT_BROWSER_SMOKE_SKIP_IMAGE_BUILD:-0}}"
GATEWAY_PORT="${OPENCLAW_BROWSER_SMOKE_GATEWAY_PORT:-18789}"
DEBUG_PORT="${OPENCLAW_BROWSER_SMOKE_DEBUG_PORT:-9222}"
TOKEN="${OPENCLAW_BROWSER_SMOKE_TOKEN:-browser-smoke-token}"

if [[ "$SKIP_IMAGE_BUILD" == "1" ]]; then
  echo "==> Reuse prebuilt browser smoke image: $IMAGE_NAME"
else
  echo "==> Build browser smoke image: $IMAGE_NAME"
  docker build \
    --build-arg OPENCLAW_INSTALL_BROWSER=1 \
    -t "$IMAGE_NAME" \
    -f "$ROOT_DIR/Dockerfile" \
    "$ROOT_DIR"
fi

echo "==> Run Docker existing-session MCP smoke"
docker run --rm -t \
  --entrypoint /bin/bash \
  -e OPENCLAW_BROWSER_SMOKE_TOKEN="$TOKEN" \
  -e OPENCLAW_BROWSER_SMOKE_GATEWAY_PORT="$GATEWAY_PORT" \
  -e OPENCLAW_BROWSER_SMOKE_DEBUG_PORT="$DEBUG_PORT" \
  "$IMAGE_NAME" -lc '
set -euo pipefail

SMOKE_STEP="bootstrap"
SMOKE_ROOT="$(mktemp -d /tmp/openclaw-browser-smoke.XXXXXX)"
CHROME_LOG="$SMOKE_ROOT/chrome.log"
GATEWAY_LOG="$SMOKE_ROOT/gateway.log"
START_LOG="$SMOKE_ROOT/browser-start.json"
STATUS_LOG="$SMOKE_ROOT/browser-status.json"
TABS_LOG="$SMOKE_ROOT/browser-tabs.json"
CHROME_PID=""
GATEWAY_PID=""
TOKEN="${OPENCLAW_BROWSER_SMOKE_TOKEN:-browser-smoke-token}"
GATEWAY_PORT="${OPENCLAW_BROWSER_SMOKE_GATEWAY_PORT:-18789}"
DEBUG_PORT="${OPENCLAW_BROWSER_SMOKE_DEBUG_PORT:-9222}"
GATEWAY_URL="ws://127.0.0.1:${GATEWAY_PORT}"

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    echo "Smoke failed during step: ${SMOKE_STEP}" >&2
    if [[ -f "$CHROME_LOG" ]]; then
      echo "--- chrome.log ---" >&2
      cat "$CHROME_LOG" >&2
    fi
    if [[ -f "$GATEWAY_LOG" ]]; then
      echo "--- gateway.log ---" >&2
      cat "$GATEWAY_LOG" >&2
    fi
    if [[ -f "$START_LOG" ]]; then
      echo "--- browser-start.json ---" >&2
      cat "$START_LOG" >&2
    fi
    if [[ -f "$STATUS_LOG" ]]; then
      echo "--- browser-status.json ---" >&2
      cat "$STATUS_LOG" >&2
    fi
    if [[ -f "$TABS_LOG" ]]; then
      echo "--- browser-tabs.json ---" >&2
      cat "$TABS_LOG" >&2
    fi
  fi
  if [[ -n "$GATEWAY_PID" ]]; then
    kill "$GATEWAY_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$CHROME_PID" ]]; then
    kill "$CHROME_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$SMOKE_ROOT"
}
trap cleanup EXIT

mkdir -p "$HOME/.openclaw"
cat > "$HOME/.openclaw/openclaw.json" <<EOF
{
  "gateway": {
    "mode": "local",
    "bind": "loopback",
    "port": ${GATEWAY_PORT},
    "auth": {
      "mode": "token",
      "token": "${TOKEN}"
    }
  },
  "browser": {
    "enabled": true,
    "headless": true,
    "noSandbox": true,
    "defaultProfile": "user",
    "profiles": {
      "user": {
        "driver": "existing-session",
        "cdpUrl": "http://127.0.0.1:${DEBUG_PORT}",
        "color": "#00AA00"
      }
    }
  }
}
EOF

SMOKE_STEP="resolve chrome executable"
CHROME_BIN="$(node -e "import(\"playwright-core\").then((m)=>process.stdout.write(m.chromium.executablePath()))")"
if [[ -z "$CHROME_BIN" || ! -x "$CHROME_BIN" ]]; then
  echo "Unable to resolve Playwright Chromium executable" >&2
  exit 1
fi

SMOKE_STEP="start chrome"
"$CHROME_BIN" \
  --headless=new \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="${DEBUG_PORT}" \
  --user-data-dir="$SMOKE_ROOT/profile" \
  --no-sandbox \
  --disable-dev-shm-usage \
  about:blank >"$CHROME_LOG" 2>&1 &
CHROME_PID=$!

SMOKE_STEP="wait for chrome debug endpoint"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${DEBUG_PORT}/json/version" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${DEBUG_PORT}/json/version" >/dev/null

SMOKE_STEP="start gateway"
openclaw gateway run --bind loopback --port "${GATEWAY_PORT}" --force >"$GATEWAY_LOG" 2>&1 &
GATEWAY_PID=$!

SMOKE_STEP="wait for gateway rpc readiness"
for _ in $(seq 1 60); do
  if openclaw gateway status --url "$GATEWAY_URL" --token "$TOKEN" --deep --require-rpc >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
openclaw gateway status --url "$GATEWAY_URL" --token "$TOKEN" --deep --require-rpc >/dev/null

SMOKE_STEP="browser start"
openclaw browser --url "$GATEWAY_URL" --token "$TOKEN" --browser-profile user --json start >"$START_LOG"

SMOKE_STEP="browser status"
openclaw browser --url "$GATEWAY_URL" --token "$TOKEN" --browser-profile user --json status >"$STATUS_LOG"

SMOKE_STEP="browser tabs"
openclaw browser --url "$GATEWAY_URL" --token "$TOKEN" --browser-profile user --json tabs >"$TABS_LOG"

SMOKE_STEP="validate outputs"
node - "$START_LOG" "$STATUS_LOG" "$TABS_LOG" <<'"'"'EOF'"'"'
const fs = require("node:fs");

const [startPath, statusPath, tabsPath] = process.argv.slice(2);
const start = JSON.parse(fs.readFileSync(startPath, "utf8"));
const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const tabs = JSON.parse(fs.readFileSync(tabsPath, "utf8"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const [label, payload] of [
  ["start", start],
  ["status", status],
]) {
  assert(payload.profile === "user", `${label}: expected profile=user`);
  assert(payload.driver === "existing-session", `${label}: expected driver existing-session`);
  assert(payload.transport === "chrome-mcp", `${label}: expected transport chrome-mcp`);
  assert(payload.running === true, `${label}: expected running=true`);
  assert(payload.cdpReady === true, `${label}: expected cdpReady=true`);
}

assert(Array.isArray(tabs.tabs), "tabs: expected tabs array");
assert(tabs.tabs.length >= 1, "tabs: expected at least one tab");
assert(
  tabs.tabs.some((tab) => typeof tab?.url === "string" && tab.url.startsWith("about:blank")),
  "tabs: expected about:blank tab",
);
EOF

echo "Browser existing-session Docker smoke passed."
'
