#!/bin/bash

set -euo pipefail

echo "🚀 Full Deployment - Instagram Reels Bot (Bun)"
echo "==============================================="

# Check dependencies
if ! command -v docker-compose &> /dev/null; then
  echo "❌ ERROR: docker-compose is not installed"
  exit 1
fi

if ! command -v git &> /dev/null; then
  echo "❌ ERROR: git is not installed"
  exit 1
fi

# Verify required files
if [ ! -f "docker-compose.yml" ]; then
  echo "❌ ERROR: docker-compose.yml not found"
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "❌ ERROR: .env file not found"
  exit 1
fi

# Check if cobalt_cobalt network exists
if ! docker network ls | grep -q "cobalt_cobalt"; then
  echo "⚠️  WARNING: cobalt_cobalt network does not exist"
  echo "   Create it with: docker network create cobalt_cobalt"
  echo "   Or it will be created automatically by docker-compose"
fi

# Pull latest code
echo "[INFO] Pulling latest code from git..."
if git pull; then
  echo "[INFO] ✅ Code updated from git"
else
  echo "[ERROR] Git pull failed"
  exit 1
fi

# Stop and remove existing containers
echo "[INFO] Stopping and removing existing containers..."
docker-compose down 2>/dev/null || true

# Force remove container if it still exists (from manual docker run)
if docker ps -a --format '{{.Names}}' | grep -qx 'insta-reel-bot'; then
  echo "[INFO] Force removing existing insta-reel-bot container..."
  docker rm -f insta-reel-bot
fi

# Build and start container
echo "[INFO] Building Docker image and starting container..."
if docker-compose up -d --build; then
  echo "[INFO] ✅ Container started"
else
  echo "[ERROR] docker-compose up failed"
  exit 1
fi

# Wait for container to be ready
echo "[INFO] Waiting for container to initialize..."
sleep 5

# Check container status
echo "[INFO] =========================================="
echo "[INFO] Deployment Status:"
echo "[INFO] =========================================="

# Show container status
echo ""
echo "[INFO] Container Status:"
docker-compose ps

# Show network info
echo ""
echo "[INFO] Network Configuration:"
docker network inspect cobalt_cobalt | jq -r '.Containers[] | "\(.Name): \(.IPv4Address)"' 2>/dev/null || echo "  (Network not ready yet)"

# Show recent logs
echo ""
echo "[INFO] Recent Bot Logs:"
docker-compose logs --tail 15

echo ""
echo "[INFO] ✅ Deployment Complete!"
echo "[INFO] =========================================="
echo "[INFO] To verify bot is working:"
echo "[INFO]   • Check container: docker-compose ps"
echo "[INFO]   • View logs: docker-compose logs --tail 50"
echo "[INFO]   • Test bot: Send /start command in Telegram"
echo "[INFO] =========================================="
