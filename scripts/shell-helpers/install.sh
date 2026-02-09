#!/usr/bin/env bash
# OpenClaw Shell Helpers Installer
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS_FILE="$SCRIPT_DIR/openclaw-helpers.sh"

# Detect shell
if [[ -n "${ZSH_VERSION:-}" ]]; then
  SHELL_RC="$HOME/.zshrc"
  SHELL_NAME="zsh"
elif [[ -n "${BASH_VERSION:-}" ]]; then
  SHELL_RC="$HOME/.bashrc"
  SHELL_NAME="bash"
else
  echo "⚠️  Could not detect shell type. Please source manually:"
  echo "   source $HELPERS_FILE"
  exit 1
fi

echo "🦞 OpenClaw Shell Helpers Installer"
echo ""
echo "Detected shell: $SHELL_NAME"
echo "Config file: $SHELL_RC"
echo ""

# Check if already installed
if grep -q "openclaw-helpers.sh" "$SHELL_RC" 2>/dev/null; then
  echo "✅ Helpers already installed in $SHELL_RC"
  echo ""
  echo "To reload:"
  echo "  source $SHELL_RC"
  exit 0
fi

# Add to shell config
echo "📝 Adding helpers to $SHELL_RC..."
cat >> "$SHELL_RC" << EOF

# OpenClaw Shell Helpers
source "$HELPERS_FILE"
EOF

echo "✅ Installation complete!"
echo ""
echo "To use the helpers now, run:"
echo "  source $SHELL_RC"
echo ""
echo "Or open a new terminal window."
echo ""
echo "To see available commands:"
echo "  openclaw-help"
