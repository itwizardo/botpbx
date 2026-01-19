#!/bin/bash
# BotPBX Auto-Update Checker
# Checks GitHub for new releases and triggers update if needed
# Runs via cron every hour: 0 * * * * root /opt/botpbx/scripts/update-check.sh

set -e

REPO="itwizardo/botpbx"
INSTALL_DIR="/opt/botpbx"
LOG_FILE="/var/log/botpbx-update.log"

# Check if auto-update is enabled (default: true)
if [ -f "$INSTALL_DIR/.env" ]; then
    AUTO_UPDATE=$(grep -E "^AUTO_UPDATE_ENABLED=" "$INSTALL_DIR/.env" | cut -d'=' -f2 | tr -d '"' || echo "true")
    if [ "$AUTO_UPDATE" = "false" ]; then
        exit 0
    fi
fi

# Get current version from package.json
if [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo "$(date): ERROR - package.json not found at $INSTALL_DIR" >> "$LOG_FILE"
    exit 1
fi

CURRENT_VERSION=$(grep '"version"' "$INSTALL_DIR/package.json" | head -1 | cut -d'"' -f4)

# Get latest release version from GitHub API
LATEST_RELEASE=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null)
if [ -z "$LATEST_RELEASE" ]; then
    echo "$(date): ERROR - Could not fetch latest release from GitHub" >> "$LOG_FILE"
    exit 1
fi

LATEST_VERSION=$(echo "$LATEST_RELEASE" | grep '"tag_name"' | head -1 | cut -d'"' -f4 | sed 's/^v//')

# If no release exists yet, check if main branch has new commits
if [ -z "$LATEST_VERSION" ]; then
    cd "$INSTALL_DIR"
    git fetch origin main --quiet 2>/dev/null
    LOCAL_COMMIT=$(git rev-parse HEAD)
    REMOTE_COMMIT=$(git rev-parse origin/main)

    if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
        echo "$(date): New commits detected on main branch, updating..." >> "$LOG_FILE"
        "$INSTALL_DIR/scripts/botpbx-update.sh"
    fi
    exit 0
fi

# Compare versions
if [ "$LATEST_VERSION" != "$CURRENT_VERSION" ]; then
    echo "$(date): New version available: $LATEST_VERSION (current: $CURRENT_VERSION)" >> "$LOG_FILE"
    "$INSTALL_DIR/scripts/botpbx-update.sh"
else
    # Uncomment for verbose logging:
    # echo "$(date): Up to date (v$CURRENT_VERSION)" >> "$LOG_FILE"
    :
fi
