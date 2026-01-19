#!/bin/bash
# BotPBX Auto-Update Script
# Performs the actual update: backup, pull, build, restart
# Called by update-check.sh when a new version is detected

set -e

INSTALL_DIR="/opt/botpbx"
LOG_FILE="/var/log/botpbx-update.log"
BACKUP_DIR="/opt/botpbx-backups"
MAX_BACKUPS=5

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S'): $1" >> "$LOG_FILE"
    echo "$1"
}

error_exit() {
    log "ERROR: $1"
    exit 1
}

# Ensure we're running as root
if [ "$EUID" -ne 0 ]; then
    error_exit "This script must be run as root"
fi

# Check if installation directory exists
if [ ! -d "$INSTALL_DIR" ]; then
    error_exit "Installation directory $INSTALL_DIR not found"
fi

log "Starting BotPBX update..."

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create timestamped backup
BACKUP_NAME="botpbx-backup-$(date +%Y%m%d_%H%M%S)"
log "Creating backup: $BACKUP_NAME"
cp -r "$INSTALL_DIR" "$BACKUP_DIR/$BACKUP_NAME" || error_exit "Failed to create backup"

# Clean up old backups (keep only MAX_BACKUPS)
cd "$BACKUP_DIR"
ls -1t | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -rf

# Pull latest code
log "Pulling latest code from GitHub..."
cd "$INSTALL_DIR"
git fetch origin || error_exit "Failed to fetch from origin"
git reset --hard origin/main || error_exit "Failed to reset to origin/main"

# Store new version for logging
NEW_VERSION=$(grep '"version"' "$INSTALL_DIR/package.json" | head -1 | cut -d'"' -f4)

# Install backend dependencies
log "Installing backend dependencies..."
npm install --production || error_exit "Failed to install backend dependencies"

# Build backend
log "Building backend..."
npm run build || error_exit "Failed to build backend"

# Install and build frontend
if [ -d "$INSTALL_DIR/web-admin" ]; then
    log "Installing frontend dependencies..."
    cd "$INSTALL_DIR/web-admin"
    npm install || error_exit "Failed to install frontend dependencies"

    log "Building frontend..."
    npm run build || error_exit "Failed to build frontend"
    cd "$INSTALL_DIR"
fi

# Restart services with zero-downtime reload
log "Restarting services..."
if command -v pm2 &> /dev/null; then
    # Use reload for zero-downtime restart
    pm2 reload botpbx --update-env 2>/dev/null || pm2 restart botpbx 2>/dev/null || true
    pm2 reload botpbx-web --update-env 2>/dev/null || pm2 restart botpbx-web 2>/dev/null || true
    pm2 save
else
    log "WARNING: PM2 not found, services not restarted"
fi

log "Update completed successfully to version $NEW_VERSION"
log "Backup saved to: $BACKUP_DIR/$BACKUP_NAME"

# Verify services are running
sleep 5
if command -v pm2 &> /dev/null; then
    BOTPBX_STATUS=$(pm2 show botpbx 2>/dev/null | grep "status" | awk '{print $4}' || echo "unknown")
    if [ "$BOTPBX_STATUS" = "online" ]; then
        log "Service verification: botpbx is running"
    else
        log "WARNING: botpbx service may not be running properly (status: $BOTPBX_STATUS)"
    fi
fi

exit 0
