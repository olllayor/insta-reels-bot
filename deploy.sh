#!/bin/bash

# Instagram Reels Bot - Docker Deployment Script
# Usage: run on the server inside the repo directory (ssh porla => insta-reels-bot)

set -euo pipefail

echo "🚀 Deploying Instagram Reels Bot (Docker)"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

IMAGE_NAME="insta-reels-bot:latest"
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

# Pull latest repository changes (optional)
info "Pulling latest code..."
git pull origin main || warn "Git pull failed or not a git repo; continuing with local files"

# Stop and remove any existing container
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    info "Stopping existing container..."
    docker stop "$CONTAINER_NAME" || true
    info "Removing existing container..."
    docker rm "$CONTAINER_NAME" || true
fi

# Remove old image (optional)
if docker images --format '{{.Repository}}:{{.Tag}}' | grep -qx "$IMAGE_NAME"; then
    info "Removing old Docker image..."
    docker rmi "$IMAGE_NAME" || warn "Could not remove old image"
fi

# Build fresh image
info "Building Docker image ($IMAGE_NAME)..."
docker build --no-cache -t "$IMAGE_NAME" .

# Ensure persistent volume exists
info "Ensuring persistent volume exists ($VOLUME_NAME)..."
docker volume create "$VOLUME_NAME" >/dev/null

# Run container
# We store the SQLite DB in /app/data/db.sqlite3 inside the volume.
# This avoids overriding the whole /app and keeps only data persistent.
info "Starting container ($CONTAINER_NAME)..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --env-file .env \
    -e DB_PATH=/app/data/db.sqlite3 \
    -v "$VOLUME_NAME":/app/data \
    --log-opt max-size=10m \
    --log-opt max-file=3 \
    "$IMAGE_NAME"

sleep 3

# Verify
info "Verifying deployment..."
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    info "✅ Container is running"
    echo
    info "📋 Container Status:"
    docker ps --filter name="$CONTAINER_NAME"
    echo
    info "📋 Recent Logs:"
    docker logs --tail 20 "$CONTAINER_NAME" || true
    echo
    info "🎉 Deployment completed successfully"
    echo "Next steps:"
    echo "  - Test: /start, /admin, send a reel URL"
    echo "  - Logs: docker logs -f $CONTAINER_NAME"
else
    error "❌ Container failed to start"
    echo
    error "Logs:"; docker logs "$CONTAINER_NAME" || true
    exit 1
fi