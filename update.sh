#!/bin/bash

# Instagram Reels Bot - Quick Update Script (using Docker Compose + Bun)
# Usage: ./update.sh (pulls latest code and restarts container without rebuilding)
# Fast deployment for code changes without Docker rebuild

set -euo pipefail

echo "🔄 Updating Instagram Reels Bot (Bun - No rebuild)"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# Ensure Docker and Docker Compose are available
if ! command -v docker >/dev/null 2>&1; then
    error "Docker is not installed or not in PATH."
    exit 1
fi

if ! command -v docker-compose >/dev/null 2>&1; then
    error "Docker Compose is not installed or not in PATH."
    exit 1
fi

# Check .env
if [ ! -f .env ]; then
    error ".env file not found."
    exit 1
fi

if [ ! -f docker-compose.yml ]; then
    error "docker-compose.yml not found in current directory."
    exit 1
fi

# Pull latest repository changes
info "Pulling latest code..."
if git pull origin main; then
    info "✅ Code updated from git"
else
    warn "Git pull failed or not a git repo; continuing with local files"
fi

# Restart container (reuse existing image for speed)
info "Restarting container with updated code..."

# Check if container exists
if docker ps -a --format '{{.Names}}' | grep -qx 'insta-reel-bot'; then
    # Container exists, restart it
    docker-compose restart
else
    # Container doesn't exist, start it
    info "Container not found, starting fresh..."
    docker-compose up -d
fi

sleep 2

# Verify
info "Verifying update..."
if docker ps --format '{{.Names}}' | grep -qx 'insta-reel-bot'; then
    info "✅ Container is running"
    echo
    info "📋 Container Status:"
    docker ps --filter name='insta-reel-bot'
    echo
    info "📋 Recent Logs:"
    docker-compose logs --tail 15 || true
    echo
    info "🎉 Update completed successfully"
    echo "Logs: docker-compose logs -f"
else
    error "❌ Container failed to start"
    echo
    error "Logs:"
    docker-compose logs || true
    exit 1
fi
