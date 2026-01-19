#!/bin/bash
# ============================================
# BotPBX Packaging Script
# Creates a distributable tarball for one-click installation
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SOURCE_DIR="/opt/novapbx"
OUTPUT_DIR="${OUTPUT_DIR:-/opt}"
OUTPUT_NAME="${OUTPUT_NAME:-botpbx.tar.gz}"
OUTPUT_PATH="$OUTPUT_DIR/$OUTPUT_NAME"

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  BotPBX Packaging Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    error "Source directory not found: $SOURCE_DIR"
fi

if [ ! -f "$SOURCE_DIR/package.json" ]; then
    error "package.json not found in $SOURCE_DIR - is this a valid BotPBX installation?"
fi

# Check for required files
log "Checking source files..."
REQUIRED_FILES=(
    "package.json"
    "install.sh"
    "src/index.ts"
    "web-admin/package.json"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$SOURCE_DIR/$file" ]; then
        error "Required file missing: $file"
    fi
done

# Remove any existing output file
if [ -f "$OUTPUT_PATH" ]; then
    warn "Removing existing $OUTPUT_PATH"
    rm -f "$OUTPUT_PATH"
fi

# Create the tarball
log "Creating tarball..."
log "  Source: $SOURCE_DIR"
log "  Output: $OUTPUT_PATH"
echo ""

cd /opt

tar czf "$OUTPUT_NAME" \
    --exclude='novapbx/node_modules' \
    --exclude='novapbx/web-admin/node_modules' \
    --exclude='novapbx/web-admin/.next' \
    --exclude='novapbx/dist' \
    --exclude='novapbx/.env' \
    --exclude='novapbx/.env.local' \
    --exclude='novapbx/web-admin/.env' \
    --exclude='novapbx/web-admin/.env.local' \
    --exclude='novapbx/credentials.txt' \
    --exclude='novapbx/data/asterisk/sounds/tts/*' \
    --exclude='novapbx/data/asterisk/recordings/*' \
    --exclude='novapbx/data/asterisk/voicemail/*' \
    --exclude='novapbx/data/asterisk/monitor/*' \
    --exclude='novapbx/logs/*' \
    --exclude='novapbx/*.log' \
    --exclude='novapbx/.git' \
    --exclude='novapbx/.claude' \
    --exclude='novapbx/package.sh' \
    --transform 's/^novapbx/botpbx/' \
    novapbx

# Move to output directory if different
if [ "$OUTPUT_DIR" != "/opt" ]; then
    mv "/opt/$OUTPUT_NAME" "$OUTPUT_PATH"
fi

# Show results
SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log "Package created successfully!"
echo ""
echo "  File: $OUTPUT_PATH"
echo "  Size: $SIZE"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "  1. Upload $OUTPUT_NAME to your web server"
echo "  2. Upload install.sh to your web server"
echo "  3. On a fresh Ubuntu server, run:"
echo ""
echo -e "     ${GREEN}wget -qO- https://your-server.com/install.sh | sudo bash${NC}"
echo ""
echo "  Or with a custom download URL:"
echo ""
echo -e "     ${GREEN}BOTPBX_DOWNLOAD_URL=https://your-server.com/$OUTPUT_NAME \\${NC}"
echo -e "     ${GREEN}wget -qO- https://your-server.com/install.sh | sudo bash${NC}"
echo ""
