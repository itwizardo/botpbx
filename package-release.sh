#!/bin/bash
# BotPBX Release Packaging Script
# Creates a distributable zip file

set -e

VERSION="${1:-1.0.0}"
RELEASE_NAME="botpbx-v${VERSION}"
RELEASE_DIR="/tmp/${RELEASE_NAME}"
OUTPUT_DIR="/opt/botpbx-releases"

echo "Creating BotPBX release package v${VERSION}..."

# Clean up previous
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy source files (excluding build artifacts and dependencies)
echo "Copying source files..."
rsync -av --exclude='node_modules' \
          --exclude='dist' \
          --exclude='.next' \
          --exclude='.env' \
          --exclude='.env.local' \
          --exclude='*.log' \
          --exclude='credentials.txt' \
          --exclude='data/' \
          --exclude='logs/' \
          --exclude='kokoro-venv/' \
          --exclude='audio/' \
          --exclude='.git' \
          --exclude='.cache' \
          --exclude='package-release.sh' \
          --exclude='*.sqlite' \
          --exclude='*.sqlite3' \
          /opt/novapbx/ "$RELEASE_DIR/"

# Remove large model files from scripts (user will download during install)
rm -f "$RELEASE_DIR/scripts/kokoro-v1.0.onnx"
rm -f "$RELEASE_DIR/scripts/voices-v1.0.bin"

# Remove any sensitive files that might have been copied
rm -f "$RELEASE_DIR/.env" "$RELEASE_DIR/.env.local"
rm -f "$RELEASE_DIR/web-admin/.env" "$RELEASE_DIR/web-admin/.env.local"

# Create the zip file
echo "Creating zip archive..."
cd /tmp
zip -r "${OUTPUT_DIR}/${RELEASE_NAME}.zip" "$RELEASE_NAME"

# Clean up
rm -rf "$RELEASE_DIR"

echo ""
echo "Release package created:"
echo "  ${OUTPUT_DIR}/${RELEASE_NAME}.zip"
echo ""
echo "Size: $(du -h ${OUTPUT_DIR}/${RELEASE_NAME}.zip | cut -f1)"
echo ""
echo "To install on a new server:"
echo "  1. Upload and extract: unzip ${RELEASE_NAME}.zip"
echo "  2. cd ${RELEASE_NAME}"
echo "  3. sudo ./install.sh"
