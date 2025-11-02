#!/bin/bash

# Instagram Reels Bot - Quick Update Script
# Usage: ./update.sh (pulls latest code and restarts container without rebuilding)
# Fast deployment for code changes without Docker rebuild

set -euo pipefail

echo "🔄 Updating Instagram Reels Bot (No rebuild)"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

CONTAINER_NAME="insta-reel-bot"
VOLUME_NAME="bot-data"

# Ensure Docker is available
if ! command -v docker >/dev/null 2>&1; then
    error "Docker is not installed or not in PATH."
    exit 1
fi

# Check .env
if [ ! -f .env ]; then
    error ".env file not found. Create it from .env.example and set your values."
    exit 1
fi

# Pull latest repository changes
info "Pulling latest code..."
if git pull origin main; then
    info "✅ Code updated from git"
else
    warn "Git pull failed or not a git repo; continuing with local files"
fi

# Stop running container
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    info "Stopping running container..."
    docker stop "$CONTAINER_NAME" || true
    sleep 2
else
    warn "Container $CONTAINER_NAME is not running; skipping stop"
fi

# Remove old container
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    info "Removing old container..."
    docker rm "$CONTAINER_NAME" || true
fi

# Run fresh container (uses existing image)
info "Starting fresh container with updated code..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --env-file .env \
    -e DB_PATH=/app/data/db.sqlite3 \
    -v "$VOLUME_NAME":/app/data \
    --log-opt max-size=10m \
    --log-opt max-file=3 \
    "insta-reels-bot:latest"

sleep 3

# Verify
info "Verifying update..."
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    info "✅ Container is running"
    echo
    info "📋 Container Status:"
    docker ps --filter name="$CONTAINER_NAME"
    echo
    info "📋 Recent Logs:"
    docker logs --tail 15 "$CONTAINER_NAME" || true
    echo
    info "🎉 Update completed successfully"
    echo "Logs: docker logs -f $CONTAINER_NAME"
else
    error "❌ Container failed to start"
    echo
    error "Logs:"; docker logs "$CONTAINER_NAME" || true
    exit 1
fi
