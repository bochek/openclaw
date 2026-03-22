#!/usr/bin/env bash
set -euo pipefail

INSTALL_URL="${OPENCLAW_INSTALL_URL:-https://openclaw.bot/install.sh}"
SMOKE_PREVIOUS_VERSION="${OPENCLAW_INSTALL_SMOKE_PREVIOUS:-}"
SKIP_PREVIOUS="${OPENCLAW_INSTALL_SMOKE_SKIP_PREVIOUS:-0}"
DEFAULT_PACKAGE="openclaw"
PACKAGE_NAME="${OPENCLAW_INSTALL_PACKAGE:-$DEFAULT_PACKAGE}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# shellcheck source=../install-sh-common/cli-verify.sh
source "$SCRIPT_DIR/../install-sh-common/cli-verify.sh"

echo "==> Resolve npm versions"
if [[ "$SKIP_PREVIOUS" == "1" ]]; then
  LATEST_VERSION="$(npm view "$PACKAGE_NAME" version)"
  PREVIOUS_VERSION="$LATEST_VERSION"
elif [[ -n "$SMOKE_PREVIOUS_VERSION" ]]; then
  LATEST_VERSION="$(npm view "$PACKAGE_NAME" version)"
  PREVIOUS_VERSION="$SMOKE_PREVIOUS_VERSION"
else
  VERSIONS_JSON="$(npm view "$PACKAGE_NAME" versions --json)"
  read -r LATEST_VERSION PREVIOUS_VERSION <<<"$(VERSIONS_JSON="$VERSIONS_JSON" node - <<'NODE'
const raw = process.env.VERSIONS_JSON || "[]";
let versions;
try {
  versions = JSON.parse(raw);
} catch {
  versions = raw ? [raw] : [];
}
if (!Array.isArray(versions)) {
  versions = [versions];
}
if (versions.length === 0) {
  process.exit(1);
}
const latest = String(versions[versions.length - 1] ?? "");
const previous = String(versions.length > 1 ? versions[versions.length - 2] : latest);
process.stdout.write(`${latest} ${previous}`);
NODE
)"
fi

echo "package=$PACKAGE_NAME latest=$LATEST_VERSION previous=$PREVIOUS_VERSION"

if [[ "$SKIP_PREVIOUS" == "1" ]]; then
  echo "==> Skip preinstall previous (OPENCLAW_INSTALL_SMOKE_SKIP_PREVIOUS=1)"
else
  echo "==> Preinstall previous (forces installer upgrade path)"
  npm install -g "${PACKAGE_NAME}@${PREVIOUS_VERSION}"
fi

echo "==> Run official installer one-liner"
curl -fsSL "$INSTALL_URL" | bash

echo "==> Verify installed version"
if [[ -n "${OPENCLAW_INSTALL_LATEST_OUT:-}" ]]; then
  printf "%s" "$LATEST_VERSION" > "${OPENCLAW_INSTALL_LATEST_OUT:-}"
fi
verify_installed_cli "$PACKAGE_NAME" "$LATEST_VERSION"

echo "OK"
