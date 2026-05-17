#!/usr/bin/env bash
#
# install-claude-code-bedrock.sh
#
# Installs Claude Code on an existing EC2 instance and configures it to use
# Amazon Bedrock. Assumes the EC2 instance has an IAM instance profile
# attached with the required Bedrock permissions (see README at bottom).
#
# Supported OS families: Amazon Linux 2, Amazon Linux 2023, Ubuntu/Debian, RHEL/CentOS
#
# Usage:
#   chmod +x install-claude-code-bedrock.sh
#   ./install-claude-code-bedrock.sh                           # interactive defaults
#   AWS_REGION=us-west-2 ./install-claude-code-bedrock.sh      # override region
#   AUTO_ATTACH_POLICY=1 ./install-claude-code-bedrock.sh      # auto-attach IAM policy
#
# Environment overrides:
#   AWS_REGION                      - AWS region (default: us-east-1)
#   NODE_VERSION                    - Node.js major version (default: 20)
#   ANTHROPIC_DEFAULT_SONNET_MODEL  - Pin Sonnet model (optional)
#   ANTHROPIC_DEFAULT_HAIKU_MODEL   - Pin Haiku model (optional)
#   SKIP_IAM_CHECK=1                - Skip IAM/Bedrock validation entirely
#   NONINTERACTIVE=1                - Skip prompts (use defaults)
#   AUTO_ATTACH_POLICY=1            - Auto-create & attach the Bedrock IAM policy
#                                      to the instance role if missing (requires
#                                      iam:CreatePolicy + iam:AttachRolePolicy
#                                      on the caller). Default: detect-only.
#   POLICY_NAME                     - IAM policy name to create/use
#                                      (default: ClaudeCodeBedrockAccess)

set -euo pipefail

# ---------- Configuration ----------
AWS_REGION="${AWS_REGION:-us-east-1}"
NODE_VERSION="${NODE_VERSION:-20}"
ANTHROPIC_DEFAULT_SONNET_MODEL="${ANTHROPIC_DEFAULT_SONNET_MODEL:-us.anthropic.claude-sonnet-4-6}"
ANTHROPIC_DEFAULT_HAIKU_MODEL="${ANTHROPIC_DEFAULT_HAIKU_MODEL:-us.anthropic.claude-haiku-4-5-20251001-v1:0}"
SKIP_IAM_CHECK="${SKIP_IAM_CHECK:-0}"
NONINTERACTIVE="${NONINTERACTIVE:-0}"
AUTO_ATTACH_POLICY="${AUTO_ATTACH_POLICY:-0}"
POLICY_NAME="${POLICY_NAME:-ClaudeCodeBedrockAccess}"

SHELL_RC=""
OS_FAMILY=""
PKG_MGR=""
SUDO=""

# ---------- Colors / logging ----------
if [ -t 1 ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
    BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
    RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; NC=""
fi

log()   { echo "${BLUE}[INFO]${NC} $*"; }
ok()    { echo "${GREEN}[ OK ]${NC} $*"; }
warn()  { echo "${YELLOW}[WARN]${NC} $*"; }
err()   { echo "${RED}[FAIL]${NC} $*" >&2; }
step()  { echo ""; echo "${BOLD}==> $*${NC}"; }

trap 'err "Script failed at line $LINENO. Exit code: $?"' ERR

# ---------- Helpers ----------
confirm() {
    # $1 = prompt, returns 0 if yes
    if [ "$NONINTERACTIVE" = "1" ]; then
        return 0
    fi
    local reply
    read -r -p "$1 [Y/n] " reply
    case "$reply" in
        ""|y|Y|yes|YES) return 0 ;;
        *) return 1 ;;
    esac
}

detect_os() {
    step "Detecting operating system"
    if [ ! -f /etc/os-release ]; then
        err "/etc/os-release not found — unsupported OS"
        exit 1
    fi
    # shellcheck disable=SC1091
    . /etc/os-release
    case "$ID" in
        amzn)
            OS_FAMILY="amazon"
            PKG_MGR=$(command -v dnf >/dev/null 2>&1 && echo dnf || echo yum)
            ;;
        ubuntu|debian)
            OS_FAMILY="debian"
            PKG_MGR="apt-get"
            ;;
        rhel|centos|rocky|almalinux|fedora)
            OS_FAMILY="rhel"
            PKG_MGR=$(command -v dnf >/dev/null 2>&1 && echo dnf || echo yum)
            ;;
        *)
            err "Unsupported OS: $ID. Supported: Amazon Linux, Ubuntu, Debian, RHEL, CentOS, Rocky, Alma, Fedora"
            exit 1
            ;;
    esac
    ok "Detected: $PRETTY_NAME (family=$OS_FAMILY, pkg=$PKG_MGR)"

    if [ "$(id -u)" -ne 0 ]; then
        if command -v sudo >/dev/null 2>&1; then
            SUDO="sudo"
        else
            err "Not running as root and sudo is not available"
            exit 1
        fi
    fi
}

detect_shell_rc() {
    # Prefer the invoking user's login shell rc
    local user_shell
    user_shell="$(basename "${SHELL:-/bin/bash}")"
    case "$user_shell" in
        zsh)  SHELL_RC="$HOME/.zshrc" ;;
        bash) SHELL_RC="$HOME/.bashrc" ;;
        *)    SHELL_RC="$HOME/.profile" ;;
    esac
    touch "$SHELL_RC"
    log "Using shell rc file: $SHELL_RC"
}

install_system_deps() {
    step "Installing system dependencies (curl, git, ca-certificates)"
    # Only install what's missing — AL2023 ships curl-minimal preinstalled, and
    # installing 'curl' conflicts with it unless --allowerasing is used.
    local need_pkgs=()
    command -v curl >/dev/null 2>&1 || need_pkgs+=(curl)
    command -v git  >/dev/null 2>&1 || need_pkgs+=(git)
    command -v tar  >/dev/null 2>&1 || need_pkgs+=(tar)
    command -v gzip >/dev/null 2>&1 || need_pkgs+=(gzip)

    if [ ${#need_pkgs[@]} -eq 0 ]; then
        ok "All base tools already present (curl, git, tar, gzip)"
        # ca-certificates still worth ensuring; treat failure as warn only
        case "$OS_FAMILY" in
            amazon|rhel) $SUDO "$PKG_MGR" install -y -q ca-certificates >/dev/null 2>&1 || true ;;
            debian)      $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates >/dev/null 2>&1 || true ;;
        esac
        return
    fi

    log "Installing missing packages: ${need_pkgs[*]}"
    case "$OS_FAMILY" in
        amazon|rhel)
            # --allowerasing resolves curl vs curl-minimal on AL2023 if needed
            $SUDO "$PKG_MGR" install -y -q --allowerasing \
                "${need_pkgs[@]}" ca-certificates >/dev/null
            ;;
        debian)
            $SUDO DEBIAN_FRONTEND=noninteractive apt-get update -qq
            $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
                "${need_pkgs[@]}" ca-certificates >/dev/null
            ;;
    esac
    ok "System dependencies installed"
}

install_nodejs() {
    step "Installing Node.js ${NODE_VERSION}"
    if command -v node >/dev/null 2>&1; then
        local current
        current="$(node -v 2>/dev/null | sed 's/^v//;s/\..*//')"
        if [ "$current" -ge "$NODE_VERSION" ] 2>/dev/null; then
            ok "Node.js $(node -v) already installed"
            return
        else
            warn "Node.js $(node -v) is older than required v${NODE_VERSION} — upgrading"
        fi
    fi

    case "$OS_FAMILY" in
        amazon|rhel)
            curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | $SUDO bash - >/dev/null
            $SUDO "$PKG_MGR" install -y -q nodejs >/dev/null
            ;;
        debian)
            curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | $SUDO -E bash - >/dev/null
            $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null
            ;;
    esac
    ok "Installed Node.js $(node -v) and npm $(npm -v)"
}

install_aws_cli() {
    step "Verifying AWS CLI"
    if command -v aws >/dev/null 2>&1; then
        ok "AWS CLI already installed: $(aws --version 2>&1)"
        return
    fi
    log "Installing AWS CLI v2"
    local arch tmpdir zipfile
    arch="$(uname -m)"
    tmpdir="$(mktemp -d)"
    case "$arch" in
        x86_64) zipfile="awscli-exe-linux-x86_64.zip" ;;
        aarch64|arm64) zipfile="awscli-exe-linux-aarch64.zip" ;;
        *) err "Unsupported architecture: $arch"; exit 1 ;;
    esac

    # Ensure unzip is available
    if ! command -v unzip >/dev/null 2>&1; then
        case "$OS_FAMILY" in
            amazon|rhel) $SUDO "$PKG_MGR" install -y -q unzip >/dev/null ;;
            debian)      $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unzip >/dev/null ;;
        esac
    fi

    curl -fsSL "https://awscli.amazonaws.com/${zipfile}" -o "${tmpdir}/awscliv2.zip"
    unzip -q "${tmpdir}/awscliv2.zip" -d "${tmpdir}"
    $SUDO "${tmpdir}/aws/install" --update >/dev/null
    rm -rf "${tmpdir}"
    ok "AWS CLI installed: $(aws --version 2>&1)"
}

install_claude_code() {
    step "Installing Claude Code"
    # Configure npm to use a user-owned global prefix so we don't need sudo
    local npm_prefix="$HOME/.npm-global"
    mkdir -p "$npm_prefix"
    npm config set prefix "$npm_prefix" >/dev/null

    if ! grep -q 'NPM_GLOBAL_PATH' "$SHELL_RC" 2>/dev/null; then
        {
            echo ''
            echo '# Claude Code: user-local npm global prefix'
            echo "export PATH=\"$npm_prefix/bin:\$PATH\"  # NPM_GLOBAL_PATH"
        } >> "$SHELL_RC"
    fi
    export PATH="$npm_prefix/bin:$PATH"

    if command -v claude >/dev/null 2>&1; then
        warn "Claude Code already installed: $(claude --version 2>&1 | head -n1)"
        if confirm "Reinstall/upgrade?"; then
            npm install -g @anthropic-ai/claude-code >/dev/null
        fi
    else
        npm install -g @anthropic-ai/claude-code >/dev/null
    fi
    ok "Claude Code installed: $(claude --version 2>&1 | head -n1)"
}

write_bedrock_env() {
    step "Writing Bedrock environment variables to $SHELL_RC"
    # Remove any previous block we manage
    if grep -q '# >>> claude-code bedrock >>>' "$SHELL_RC"; then
        # Portable in-place delete between markers
        local tmp
        tmp="$(mktemp)"
        awk '
            /# >>> claude-code bedrock >>>/ { skip=1; next }
            /# <<< claude-code bedrock <<</ { skip=0; next }
            skip != 1 { print }
        ' "$SHELL_RC" > "$tmp"
        mv "$tmp" "$SHELL_RC"
    fi

    cat >> "$SHELL_RC" <<EOF

# >>> claude-code bedrock >>>
# Managed by install-claude-code-bedrock.sh
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=${AWS_REGION}
export ANTHROPIC_DEFAULT_SONNET_MODEL='${ANTHROPIC_DEFAULT_SONNET_MODEL}'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='${ANTHROPIC_DEFAULT_HAIKU_MODEL}'
# <<< claude-code bedrock <<<
EOF
    ok "Bedrock env written (region=${AWS_REGION})"
}

verify_credentials_and_bedrock() {
    step "Verifying AWS credentials and Bedrock access"
    if [ "$SKIP_IAM_CHECK" = "1" ]; then
        warn "SKIP_IAM_CHECK=1 — skipping credential and Bedrock verification"
        return
    fi

    if ! aws sts get-caller-identity --region "$AWS_REGION" >/tmp/caller.json 2>/dev/null; then
        err "Unable to get AWS caller identity. Attach an IAM instance profile or configure credentials."
        exit 1
    fi
    local caller_arn
    caller_arn="$(grep -o '"Arn": *"[^"]*"' /tmp/caller.json | head -n1 | cut -d'"' -f4)"
    ok "AWS identity: ${caller_arn}"

    # Detect and (optionally) attach the Bedrock IAM policy to the instance role
    ensure_bedrock_iam_policy "$caller_arn"

    if aws bedrock list-inference-profiles --region "$AWS_REGION" >/dev/null 2>&1; then
        ok "Bedrock API reachable in ${AWS_REGION}"
    else
        warn "bedrock:ListInferenceProfiles failed. Confirm the IAM role has Bedrock permissions"
        warn "and that Claude models are enabled in the Bedrock console for this account/region."
    fi
    rm -f /tmp/caller.json
}

# ---------- IAM policy management ----------
# Detect the EC2 instance role from the caller ARN and ensure the Bedrock
# policy is attached. Non-destructive by default: reports status only.
# If AUTO_ATTACH_POLICY=1, prompts and then creates+attaches the policy.
ensure_bedrock_iam_policy() {
    local caller_arn="$1"
    step "Checking IAM policy for Bedrock access"

    # Only assumed-role ARNs (EC2 instance profile) produce a role we can target.
    # Example ARN: arn:aws:sts::123456789012:assumed-role/MyEC2Role/i-0abc...
    if ! echo "$caller_arn" | grep -q ':assumed-role/'; then
        warn "Caller is not an assumed role (likely a user or root). Skipping policy attach."
        warn "  Caller: ${caller_arn}"
        return 0
    fi

    local role_name account_id
    role_name="$(echo "$caller_arn" | sed -E 's|.*:assumed-role/([^/]+)/.*|\1|')"
    account_id="$(echo "$caller_arn" | sed -E 's|arn:aws:sts::([0-9]+):.*|\1|')"
    log "Instance role: ${role_name} (account: ${account_id})"

    local policy_arn="arn:aws:iam::${account_id}:policy/${POLICY_NAME}"

    # Check if policy is already attached to the role (by matching known actions)
    local attached_policies
    if ! attached_policies="$(aws iam list-attached-role-policies \
            --role-name "$role_name" --output text \
            --query 'AttachedPolicies[].PolicyArn' 2>/dev/null)"; then
        warn "Unable to list attached policies (caller may lack iam:ListAttachedRolePolicies)"
        warn "Manual step required: attach a policy with bedrock:InvokeModel* to '${role_name}'"
        return 0
    fi

    if echo "$attached_policies" | tr '\t' '\n' | grep -qx "$policy_arn"; then
        ok "Policy '${POLICY_NAME}' is already attached to role '${role_name}'"
        return 0
    fi

    # Do a functional check: if Bedrock already works, a differently-named policy
    # is probably covering it and we should not add a duplicate.
    if aws bedrock list-inference-profiles --region "$AWS_REGION" >/dev/null 2>&1; then
        ok "Role '${role_name}' already has working Bedrock access (via another policy)"
        return 0
    fi

    warn "Role '${role_name}' does not appear to have Bedrock permissions"

    if [ "$AUTO_ATTACH_POLICY" != "1" ]; then
        cat <<EOF
${YELLOW}
  To auto-create and attach the required policy, re-run with:
      AUTO_ATTACH_POLICY=1 $0

  Or attach this policy manually to role '${role_name}':
${NC}
$(bedrock_policy_document)

EOF
        return 0
    fi

    # AUTO_ATTACH_POLICY=1 path — this modifies IAM
    echo ""
    warn "AUTO_ATTACH_POLICY=1 is set. This will:"
    echo "  1. Create IAM policy '${POLICY_NAME}' in account ${account_id} (if missing)"
    echo "  2. Attach it to role '${role_name}'"
    echo ""
    if ! confirm "Proceed with IAM changes?"; then
        warn "Skipping IAM policy attachment at user request"
        return 0
    fi

    # Step 1: Create the policy if it doesn't exist
    if aws iam get-policy --policy-arn "$policy_arn" >/dev/null 2>&1; then
        ok "Policy '${POLICY_NAME}' already exists (${policy_arn})"
    else
        log "Creating policy '${POLICY_NAME}'"
        local tmp_policy
        tmp_policy="$(mktemp)"
        bedrock_policy_document > "$tmp_policy"
        if ! aws iam create-policy \
                --policy-name "$POLICY_NAME" \
                --policy-document "file://${tmp_policy}" \
                --description "Allows Claude Code to invoke Anthropic models on Amazon Bedrock" \
                >/dev/null 2>&1; then
            rm -f "$tmp_policy"
            err "Failed to create IAM policy. Caller may lack iam:CreatePolicy."
            err "  Create it manually, then re-run without AUTO_ATTACH_POLICY=1."
            return 1
        fi
        rm -f "$tmp_policy"
        ok "Created policy: ${policy_arn}"
    fi

    # Step 2: Attach to role
    log "Attaching policy to role '${role_name}'"
    if aws iam attach-role-policy \
            --role-name "$role_name" \
            --policy-arn "$policy_arn" >/dev/null 2>&1; then
        ok "Attached '${POLICY_NAME}' to role '${role_name}'"
        log "Waiting 10s for IAM propagation..."
        sleep 10
    else
        err "Failed to attach policy. Caller may lack iam:AttachRolePolicy."
        return 1
    fi
}

bedrock_policy_document() {
    cat <<'POLICY'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowModelAndInferenceProfileAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListInferenceProfiles",
        "bedrock:GetInferenceProfile"
      ],
      "Resource": [
        "arn:aws:bedrock:*:*:inference-profile/*",
        "arn:aws:bedrock:*:*:application-inference-profile/*",
        "arn:aws:bedrock:*:*:foundation-model/*"
      ]
    },
    {
      "Sid": "AllowMarketplaceSubscription",
      "Effect": "Allow",
      "Action": [
        "aws-marketplace:ViewSubscriptions",
        "aws-marketplace:Subscribe"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:CalledViaLast": "bedrock.amazonaws.com"
        }
      }
    }
  ]
}
POLICY
}

print_summary() {
    step "Installation complete"
    cat <<EOF

${BOLD}Next steps:${NC}
  1. Reload your shell so the new env vars are active:
       ${GREEN}source $SHELL_RC${NC}

  2. (First-time-per-account only) Enable Anthropic models in the Bedrock console:
       https://console.aws.amazon.com/bedrock/home?region=${AWS_REGION}#/modelaccess

  3. Start Claude Code:
       ${GREEN}claude${NC}

  4. Inside Claude Code, run ${BOLD}/status${NC} — the provider should show "Amazon Bedrock".

${BOLD}Current configuration:${NC}
  CLAUDE_CODE_USE_BEDROCK        = 1
  AWS_REGION                     = ${AWS_REGION}
  ANTHROPIC_DEFAULT_SONNET_MODEL = ${ANTHROPIC_DEFAULT_SONNET_MODEL}
  ANTHROPIC_DEFAULT_HAIKU_MODEL  = ${ANTHROPIC_DEFAULT_HAIKU_MODEL}

${BOLD}Required IAM permissions on the EC2 instance role:${NC}
  bedrock:InvokeModel
  bedrock:InvokeModelWithResponseStream
  bedrock:ListInferenceProfiles
  bedrock:GetInferenceProfile

${BOLD}If Bedrock access is missing, attach the policy automatically with:${NC}
  ${GREEN}AUTO_ATTACH_POLICY=1 $0${NC}
  (caller must also have iam:CreatePolicy + iam:AttachRolePolicy)

EOF
}

# ---------- Main ----------
main() {
    echo "${BOLD}Claude Code + Amazon Bedrock installer${NC}"
    echo "Region: ${AWS_REGION}"
    echo ""

    detect_os
    detect_shell_rc
    install_system_deps
    install_nodejs
    install_aws_cli
    install_claude_code
    write_bedrock_env
    verify_credentials_and_bedrock
    print_summary
}

main "$@"
