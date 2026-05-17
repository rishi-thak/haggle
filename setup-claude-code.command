#!/bin/bash
#
# Claude Code + Amazon Bedrock — One-Click Setup
# Double-click this file to install and configure Claude Code with Bedrock.
#

set -e

clear
echo "==========================================="
echo "  Claude Code + Amazon Bedrock Setup"
echo "==========================================="
echo ""

# Check for python3
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found."
    echo ""
    echo "    Install Xcode Command Line Tools by running:"
    echo "    xcode-select --install"
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

# Step 1: Install Claude Code if not present
echo "[1/4] Checking for Claude Code..."
if command -v claude &> /dev/null; then
    echo "       Claude Code is already installed ($(claude --version 2>/dev/null || echo 'installed'))"
    echo "       Logging out of any existing account..."
    claude auth logout 2>/dev/null || true
else
    echo "       Claude Code not found. Installing..."
    curl -fsSL https://claude.ai/install.sh | bash
    export PATH="$HOME/.claude/bin:$PATH"
    if command -v claude &> /dev/null; then
        echo "       Claude Code installed successfully"
    else
        echo ""
        echo "    ERROR: Installation failed."
        echo "    Try manually: curl -fsSL https://claude.ai/install.sh | bash"
        read -p "Press Enter to close..."
        exit 1
    fi
fi

# Step 2: Collect AWS credentials
echo ""
echo "[2/4] AWS credentials needed to connect to Bedrock."
echo ""
echo "       Paste your AWS credentials from the Workshop Studio dashboard."
echo "       (Copy all the export lines, paste them here, then press Enter twice)"
echo ""
echo "       Example format:"
echo '       export AWS_DEFAULT_REGION="us-east-1"'
echo '       export AWS_ACCESS_KEY_ID="ASIA..."'
echo '       export AWS_SECRET_ACCESS_KEY="..."'
echo '       export AWS_SESSION_TOKEN="..."'
echo ""
echo "       Paste now:"
echo ""

# Read pasted credentials
AWS_CREDS=""
while IFS= read -r line; do
    [ -z "$line" ] && break
    AWS_CREDS+="$line"$'\n'
done

# Export the credentials
eval "$AWS_CREDS"

# Verify credentials were set
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo ""
    echo "    ERROR: AWS credentials not detected."
    echo "    Make sure you pasted the export lines from Workshop Studio."
    read -p "Press Enter to close..."
    exit 1
fi

# Step 3: Configure Claude Code for Bedrock
echo ""
echo "[3/4] Configuring Claude Code to use Amazon Bedrock..."
export CLAUDE_CODE_USE_BEDROCK="1"
export CLAUDE_CODE_USE_MANTLE="1"
export AWS_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

# Clear any existing Anthropic API key so Claude Code uses Bedrock instead
unset ANTHROPIC_API_KEY

# Override settings.json to use Bedrock model (prevents direct API fallback)
if [ -f "$HOME/.claude/settings.json" ]; then
    cp "$HOME/.claude/settings.json" "$HOME/.claude/settings.json.bak"
    echo "       Backed up existing settings to ~/.claude/settings.json.bak"
fi
mkdir -p "$HOME/.claude"
echo '{"model": "us.anthropic.claude-opus-4-6-v1[1m]"}' > "$HOME/.claude/settings.json"

echo "       CLAUDE_CODE_USE_BEDROCK=1"
echo "       AWS_REGION=$AWS_REGION"
echo "       Model: Claude Opus 4.6 (via Bedrock)"
echo "       Credentials configured"

# Add AWS MCP server (if not already added)
echo ""
echo "       Adding AWS MCP server..."
claude mcp add-json aws-mcp --scope user '{"command":"uvx","args":["mcp-proxy-for-aws@latest","https://aws-mcp.us-east-1.api.aws/mcp","--metadata","AWS_REGION=us-east-1"]}' 2>/dev/null || true
echo "       AWS MCP configured"

# Step 4: Launch Claude Code
echo ""
echo "[4/4] Launching Claude Code..."
echo ""
echo "==========================================="
echo "  Setup complete!"
echo ""
echo "  Claude Code is connected to"
echo "  Amazon Bedrock ($AWS_REGION)"
echo ""
echo "  Credentials valid for ~12 hours."
echo "  Re-run this script to refresh."
echo "==========================================="
echo ""
echo "  Starting Claude Code now..."
echo "  (Type your prompt or /help to get started)"
echo ""

claude
