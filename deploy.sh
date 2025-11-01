#!/bin/bash

# Instagram Reels Bot - Production Deployment Script
# Run this script on your server to deploy/update the bot

set -e  # Exit on any error

echo "🚀 Deploying Instagram Reels Bot to Production..."
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found! Please create it with your bot configuration."
    exit 1
fi

# Pull latest code
print_status "Pulling latest code from repository..."
git pull origin main

# Stop existing container
print_status "Stopping existing container..."
docker stop insta-reel-bot 2>/dev/null || print_warning "No existing container to stop"

# Remove existing container
print_status "Removing existing container..."
docker rm insta-reel-bot 2>/dev/null || print_warning "No existing container to remove"

# Remove old image
print_status "Removing old Docker image..."
docker rmi insta-reels-bot:latest 2>/dev/null || print_warning "No old image to remove"

# Build new image
print_status "Building new Docker image..."
docker build --no-cache -t insta-reels-bot:latest .

# Create volume if it doesn't exist
print_status "Ensuring persistent volume exists..."
docker volume create bot-data 2>/dev/null || print_warning "Volume already exists"

# Run new container
print_status "Starting production container..."
docker run -d \
  --name insta-reel-bot \
  --restart unless-stopped \
  --env-file .env \
  -v bot-data:/app/data \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  insta-reels-bot:latest

# Wait a moment for container to start
sleep 3

# Verify deployment
print_status "Verifying deployment..."
if docker ps | grep -q insta-reel-bot; then
    print_status "✅ Container is running!"
    echo ""
    print_status "📋 Container Status:"
    docker ps | grep insta-reel-bot
    echo ""
    print_status "📋 Recent Logs:"
    docker logs --tail 10 insta-reel-bot
    echo ""
    print_status "🎉 Deployment completed successfully!"
    echo ""
    print_status "Next steps:"
    echo "  1. Test your bot by sending /start"
    echo "  2. Send /admin to check analytics"
    echo "  3. Send an Instagram URL to test downloads"
    echo "  4. Monitor logs: docker logs -f insta-reel-bot"
else
    print_error "❌ Container failed to start!"
    echo ""
    print_error "Check logs for errors:"
    docker logs insta-reel-bot
    exit 1
fi