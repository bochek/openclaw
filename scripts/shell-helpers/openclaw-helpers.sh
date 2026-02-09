#!/usr/bin/env bash
# OpenClaw Shell Helpers
# User-friendly shell commands for managing OpenClaw Docker containers
#
# Installation:
#   Source this file from your shell rc file:
#   echo 'source /path/to/openclaw-helpers.sh' >> ~/.zshrc
#
# Usage:
#   openclaw-help    # Show all available commands

# OpenClaw project directory (auto-detect or set manually)
OPENCLAW_DIR="${OPENCLAW_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Start openclaw gateway
alias openclaw-start="docker compose -f ${OPENCLAW_DIR}/docker-compose.yml up -d openclaw-gateway"

# Stop openclaw gateway
alias openclaw-stop="docker compose -f ${OPENCLAW_DIR}/docker-compose.yml down"

# Restart openclaw gateway
alias openclaw-restart="docker compose -f ${OPENCLAW_DIR}/docker-compose.yml restart openclaw-gateway"

# View openclaw logs
alias openclaw-logs="docker compose -f ${OPENCLAW_DIR}/docker-compose.yml logs -f openclaw-gateway"

# Check openclaw status
alias openclaw-status="docker compose -f ${OPENCLAW_DIR}/docker-compose.yml ps"

# Open openclaw directory
alias openclaw-cd="cd ${OPENCLAW_DIR}"

# Shell into openclaw container (with openclaw alias pre-configured)
openclaw-shell() {
  docker compose -f "${OPENCLAW_DIR}/docker-compose.yml" exec openclaw-gateway \
    bash -c 'echo "alias openclaw=\"./openclaw.mjs\"" > /tmp/.bashrc_openclaw && bash --rcfile /tmp/.bashrc_openclaw'
}

# Rebuild openclaw Docker image
alias openclaw-rebuild="docker compose -f ${OPENCLAW_DIR}/docker-compose.yml build openclaw-gateway"

# Open config directory
alias openclaw-config="cd ~/.openclaw"

# Open workspace directory
alias openclaw-workspace="cd ~/.openclaw/workspace"

# Clean up containers and volumes (nuclear option)
alias openclaw-clean="docker compose -f ${OPENCLAW_DIR}/docker-compose.yml down -v --remove-orphans"

# Health check
openclaw-health() {
  docker compose -f "${OPENCLAW_DIR}/docker-compose.yml" exec openclaw-gateway \
    node dist/index.js health --token "$(grep OPENCLAW_GATEWAY_TOKEN ${OPENCLAW_DIR}/.env | cut -d'=' -f2)"
}

# Show gateway token
openclaw-token() {
  grep OPENCLAW_GATEWAY_TOKEN "${OPENCLAW_DIR}/.env" | cut -d'=' -f2
}

# Execute command in container
openclaw-exec() {
  docker compose -f "${OPENCLAW_DIR}/docker-compose.yml" exec openclaw-gateway "$@"
}

# Run interactive CLI commands (dedicated CLI container)
alias openclaw-cli="docker compose -f ${OPENCLAW_DIR}/docker-compose.yml run --rm openclaw-cli"

# Fix token configuration (run this once after setup)
openclaw-fix-token() {
  echo "🔧 Configuring gateway token..."
  local token=$(openclaw-token)
  if [[ -z "$token" ]]; then
    echo "❌ Error: Could not find gateway token"
    echo "   Check: ${OPENCLAW_DIR}/.env"
    return 1
  fi

  echo "📝 Setting token: ${token:0:20}..."

  # Set both tokens directly (simpler approach)
  docker compose -f "${OPENCLAW_DIR}/docker-compose.yml" exec openclaw-gateway \
    bash -c "./openclaw.mjs config set gateway.remote.token '$token' && ./openclaw.mjs config set gateway.auth.token '$token'" 2>&1 | grep -v "^WARN\|^time="

  echo "🔍 Verifying token was saved..."
  local saved_token=$(docker compose -f "${OPENCLAW_DIR}/docker-compose.yml" exec openclaw-gateway \
    bash -c "./openclaw.mjs config get gateway.remote.token 2>/dev/null" 2>&1 | grep -v "^WARN\|^time=" | tr -d '\r\n' | head -c 64)

  if [[ "$saved_token" == "$token" ]]; then
    echo "✅ Token saved correctly!"
  else
    echo "⚠️  Token mismatch detected"
    echo "   Expected: ${token:0:20}..."
    echo "   Got: ${saved_token:0:20}..."
  fi

  echo "🔄 Restarting gateway..."
  docker compose -f "${OPENCLAW_DIR}/docker-compose.yml" restart openclaw-gateway 2>&1 | grep -v "^WARN\|^time="

  echo "⏳ Waiting for gateway to start..."
  sleep 5

  echo "✅ Configuration complete!"
  echo "   Try: openclaw-devices"
}

# Open dashboard in browser
openclaw-dashboard() {
  echo "🦞 Getting dashboard URL..."
  local url=$(docker compose -f "${OPENCLAW_DIR}/docker-compose.yml" run --rm openclaw-cli dashboard --no-open 2>&1 | grep -v "^WARN\|^time=" | grep -o 'http[s]\?://[^[:space:]]*')

  if [[ -n "$url" ]]; then
    echo "✅ Opening: $url"
    open "$url" 2>/dev/null || xdg-open "$url" 2>/dev/null || echo "   Please open manually: $url"
    echo ""
    echo "💡 If you see 'pairing required' error:"
    echo "   1. Run: openclaw-devices"
    echo "   2. Copy the Request ID from the Pending table"
    echo "   3. Run: openclaw-approve <request-id>"
  else
    echo "❌ Failed to get dashboard URL"
    echo "   Try restarting: openclaw-restart"
  fi
}

# List device pairings
openclaw-devices() {
  echo "🔍 Checking device pairings..."
  docker compose -f "${OPENCLAW_DIR}/docker-compose.yml" exec openclaw-gateway \
    node dist/index.js devices list 2>&1 | grep -v "^WARN\|^time="

  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo ""
    echo "💡 If you see token errors above:"
    echo "   1. Verify token is set: openclaw-token"
    echo "   2. Try manual config inside container:"
    echo "      openclaw-shell"
    echo "      openclaw config get gateway.remote.token"
    return 1
  fi

  echo ""
  echo "💡 To approve a pairing request:"
  echo "   openclaw-approve <request-id>"
}

# Approve device pairing request
openclaw-approve() {
  if [[ -z "$1" ]]; then
    echo "❌ Usage: openclaw-approve <request-id>"
    echo ""
    echo "💡 How to approve a device:"
    echo "   1. Run: openclaw-devices"
    echo "   2. Find the Request ID in the Pending table (long UUID)"
    echo "   3. Run: openclaw-approve <that-request-id>"
    echo ""
    echo "Example:"
    echo "   openclaw-approve 6f9db1bd-a1cc-4d3f-b643-2c195262464e"
    return 1
  fi

  echo "✅ Approving device: $1"
  docker compose -f "${OPENCLAW_DIR}/docker-compose.yml" exec openclaw-gateway \
    node dist/index.js devices approve "$1" 2>&1 | grep -v "^WARN\|^time="

  echo ""
  echo "✅ Device approved! Refresh your browser."
}

# Show all available openclaw helper commands
openclaw-help() {
  # Colors
  local CYAN='\033[0;36m'
  local BOLD='\033[1m'
  local GREEN='\033[0;32m'
  local YELLOW='\033[1;33m'
  local BLUE='\033[0;34m'
  local MAGENTA='\033[0;35m'
  local RED='\033[0;31m'
  local RESET='\033[0m'
  local DIM='\033[2m'

  echo -e "\n${BOLD}${CYAN}🦞 OpenClaw Helper Commands${RESET}\n"

  echo -e "${BOLD}${MAGENTA}⚡ Basic Operations${RESET}"
  echo -e "  ${BOLD}openclaw-start${RESET}       ${DIM}Start the gateway${RESET}"
  echo -e "  ${BOLD}openclaw-stop${RESET}        ${DIM}Stop the gateway${RESET}"
  echo -e "  ${BOLD}openclaw-restart${RESET}     ${DIM}Restart the gateway${RESET}"
  echo -e "  ${BOLD}openclaw-status${RESET}      ${DIM}Check container status${RESET}"
  echo -e "  ${BOLD}openclaw-logs${RESET}        ${DIM}View live logs (follows)${RESET}"
  echo ""

  echo -e "${BOLD}${MAGENTA}🐚 Container Access${RESET}"
  echo -e "  ${BOLD}openclaw-shell${RESET}       ${DIM}Shell into container (openclaw alias ready)${RESET}"
  echo -e "  ${BOLD}openclaw-cli${RESET}         ${DIM}Run CLI commands (e.g., openclaw-cli status)${RESET}"
  echo -e "  ${BOLD}openclaw-exec${RESET} ${CYAN}<cmd>${RESET}  ${DIM}Execute command in gateway container${RESET}"
  echo ""

  echo -e "${BOLD}${MAGENTA}🌐 Web UI & Devices${RESET}"
  echo -e "  ${BOLD}openclaw-dashboard${RESET}   ${DIM}Open web UI in browser ${YELLOW}(auto-guides you)${RESET}"
  echo -e "  ${BOLD}openclaw-devices${RESET}     ${DIM}List device pairings ${YELLOW}(auto-guides you)${RESET}"
  echo -e "  ${BOLD}openclaw-approve${RESET} ${CYAN}<id>${RESET} ${DIM}Approve device pairing ${YELLOW}(with examples)${RESET}"
  echo ""

  echo -e "${BOLD}${MAGENTA}⚙️  Setup & Configuration${RESET}"
  echo -e "  ${BOLD}openclaw-fix-token${RESET}   ${DIM}Configure gateway token ${YELLOW}(run once)${RESET}"
  echo ""

  echo -e "${BOLD}${MAGENTA}🔧 Maintenance${RESET}"
  echo -e "  ${BOLD}openclaw-rebuild${RESET}     ${DIM}Rebuild Docker image${RESET}"
  echo -e "  ${BOLD}openclaw-clean${RESET}       ${RED}⚠️  Remove containers & volumes (nuclear)${RESET}"
  echo ""

  echo -e "${BOLD}${MAGENTA}🛠️  Utilities${RESET}"
  echo -e "  ${BOLD}openclaw-health${RESET}      ${DIM}Run health check${RESET}"
  echo -e "  ${BOLD}openclaw-token${RESET}       ${DIM}Show gateway auth token${RESET}"
  echo -e "  ${BOLD}openclaw-cd${RESET}          ${DIM}Jump to openclaw project directory${RESET}"
  echo -e "  ${BOLD}openclaw-config${RESET}      ${DIM}Open config directory (~/.openclaw)${RESET}"
  echo -e "  ${BOLD}openclaw-workspace${RESET}   ${DIM}Open workspace directory${RESET}"
  echo ""

  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${GREEN}🚀 First Time Setup${RESET}"
  echo -e "${CYAN}  1.${RESET} ${GREEN}openclaw-start${RESET}          ${DIM}# Start the gateway${RESET}"
  echo -e "${CYAN}  2.${RESET} ${GREEN}openclaw-fix-token${RESET}      ${DIM}# Configure token${RESET}"
  echo -e "${CYAN}  3.${RESET} ${GREEN}openclaw-dashboard${RESET}      ${DIM}# Open web UI${RESET}"
  echo -e "${CYAN}  4.${RESET} ${GREEN}openclaw-devices${RESET}        ${DIM}# If pairing needed${RESET}"
  echo -e "${CYAN}  5.${RESET} ${GREEN}openclaw-approve${RESET} ${CYAN}<id>${RESET}   ${DIM}# Approve pairing${RESET}"
  echo ""

  echo -e "${BOLD}${GREEN}💬 WhatsApp Setup${RESET}"
  echo -e "  ${GREEN}openclaw-shell${RESET}"
  echo -e "    ${BLUE}>${RESET} ${GREEN}openclaw channels login --channel whatsapp${RESET}"
  echo -e "    ${BLUE}>${RESET} ${GREEN}openclaw status${RESET}"
  echo ""

  echo -e "${BOLD}${GREEN}📝 Quick Examples${RESET}"
  echo -e "  ${GREEN}openclaw-start${RESET} && ${GREEN}openclaw-logs${RESET}"
  echo -e "  ${GREEN}openclaw-dashboard${RESET}"
  echo -e "  ${GREEN}openclaw-devices${RESET}"
  echo -e "  ${GREEN}openclaw-cli${RESET} ${CYAN}channels login${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""

  echo -e "${YELLOW}💡 All commands guide you through next steps!${RESET}"
  echo -e "${BLUE}📚 Docs: ${RESET}${CYAN}https://docs.openclaw.ai${RESET}"
  echo ""
}

# Export functions so they're available in subshells
export -f openclaw-shell openclaw-health openclaw-token openclaw-exec
export -f openclaw-fix-token openclaw-dashboard openclaw-devices
export -f openclaw-approve openclaw-help
