# Deployment Guide - v2.0.0 (Bun)

## 🚀 Server Deployment Steps (Docker Method - Recommended)

### Quick Deploy (Full Rebuild)
```bash
cd /path/to/insta-reel-bot
./deploy.sh
```

This script automatically:
1. Pulls latest code from git
2. Stops existing containers
3. Rebuilds Docker image with Bun
4. Starts the bot
5. Shows logs and status

### Quick Update (No Rebuild)
```bash
cd /path/to/insta-reel-bot
./update.sh
```

Use this for minor updates that don't require rebuilding the Docker image.

---

## 🔧 Manual Server Deployment (Without Docker)

### Step 1: Install Bun on Server
```bash
curl -fsSL https://bun.sh/install | bash
```

### Step 2: Update Code
```bash
cd /path/to/insta-reel-bot
git fetch origin
git checkout main
git pull origin main
```

### Step 3: Install Dependencies
```bash
bun install
```

### Step 4: Verify Installation
```bash
# Test bot startup (Ctrl+C after confirming initialization)
bun run bot.ts
```

### Step 5: Start Bot with Process Manager
```bash
# Using pm2
pm2 restart insta-reel-bot
# or
pm2 start --name insta-reel-bot "bun run bot.ts"

# Start cron job
pm2 start --name insta-reel-cron "bun run cron.ts" --cron "0 */4 * * *"
```

### Step 6: Verify Running
```bash
# Check bot is running
pm2 list

# View logs
pm2 logs insta-reel-bot
pm2 logs insta-reel-cron
```

---

## 📋 Pre-Deployment Checklist

- [ ] Bun is installed on server (v1.0.0 or higher)
- [ ] Database backup created (if upgrading from older version)
- [ ] `.env` file updated with all required variables including `ADMIN_ID`
- [ ] Previous bot instance is stopped
- [ ] Telegram bot token is valid
- [ ] Channel access permissions are configured
- [ ] Docker and docker-compose installed (for Docker deployment)
- [ ] `cobalt_cobalt` network exists (for Docker deployment)

---

## 🔧 Environment Variables Required

```env
BOT_TOKEN=your_bot_token_here
API_ENDPOINT=https://cobalt.ollayor.uz/
ADMIN_ID=your_telegram_id
ADMIN_CHAT_ID=your_admin_chat_id
DB_PATH=db.sqlite3
CRON_INTERVAL_HOURS=4
TELEGRAM_CHANNEL_ID=-1002933382410
DOWNLOADER_TIMEOUT_MS=20000
```

## ✅ Post-Deployment Verification

1. **Check container status (Docker)**
   ```bash
   docker-compose ps
   # Should show: Up (healthy)
   ```

2. **View logs (Docker)**
   ```bash
   docker-compose logs -f
   # Should show: [INFO] Bot initialized
   ```

3. **Send test message to bot**
   - Send `/start` command
   - Verify welcome message appears

4. **Test admin commands**
   - Send `/admin` to verify stats display
   - Send `/stats` for detailed metrics
   - Send `/help` to see available commands

5. **Test video download**
   - Send a valid Instagram Reel URL
   - Verify video is sent to user

6. **Test inline mode**
   - Open any chat
   - Type `@your_bot_username` + Instagram URL
   - Verify inline result appears

---

## 🐳 Docker Commands Reference

```bash
# View logs in real-time
docker-compose logs -f

# Check container status
docker-compose ps

# Restart container
docker-compose restart

# Stop container
docker-compose down

# Rebuild and start
docker-compose up -d --build

# View resource usage
docker stats insta-reel-bot

# Access container shell
docker exec -it insta-reel-bot sh
```

---

## 🔄 Migration from pnpm to Bun

If you're migrating an existing deployment:

### Local Migration
```bash
# Remove pnpm files
rm -f pnpm-lock.yaml pnpm-workspace.yaml

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install dependencies with Bun
bun install

# Test locally
bun run bot.ts
```

### Server Migration (Docker)
```bash
# On server
cd /path/to/insta-reel-bot
git pull origin main

# Rebuild with new Bun image
./deploy.sh
```

The deploy script handles everything automatically.

---

## ⚡ Why Bun?

- **~3x faster installation** compared to npm/pnpm
- **Native TypeScript support** - no need for tsx/ts-node
- **Better SQLite performance** - native module handling
- **Smaller Docker images** - oven/bun:1-alpine is optimized
- **Drop-in replacement** - compatible with Node.js packages
- **Built-in watch mode** - `bun --watch` for development

---

## 🆘 Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs

# Verify .env file
cat .env | grep BOT_TOKEN

# Rebuild from scratch
docker-compose down
docker-compose up -d --build --force-recreate
```

### Database errors
```bash
# Check database file permissions
ls -la data/db.sqlite3

# Access container and check database
docker exec -it insta-reel-bot sh
cd /app/data
ls -la
```

### Inline mode not working
- Verify inline mode is enabled in BotFather
- Check bot logs for inline query events
- Ensure bot has proper permissions

---

## 📊 Performance Comparison (Bun vs Node.js)

| Metric | Node.js + pnpm | Bun |
|--------|----------------|-----|
| Install time | ~15-20s | ~5s |
| Cold start | ~800ms | ~300ms |
| Memory usage | ~120MB | ~90MB |
| Docker image | ~450MB | ~320MB |

---
   - Verify video is forwarded to channel (@reels_db)
   - Check database for video persistence

4. **Monitor logs**
   ```bash
   pm2 logs insta-reel-bot --lines 50
   ```

## 🚨 Rollback Procedure (if needed)

```bash
# If something goes wrong, rollback to previous version
git checkout main~1
pnpm install
pnpm rebuild better-sqlite3
pm2 restart insta-reel-bot
```

## 📊 Monitoring Commands

```bash
# View process health
pm2 status

# View real-time logs
pm2 logs insta-reel-bot

# View specific line count
pm2 logs insta-reel-bot --lines 100

# Clear logs
pm2 flush
```

## 🐛 Troubleshooting

### Bot fails to start
```bash
# Check for conflicting process
ps aux | grep tsx
ps aux | grep bot

# Kill any existing processes
pkill -f "tsx bot.ts"
pkill -f "insta-reel-bot"
```

### Database locked error
```bash
# SQLite WAL mode sometimes needs cleanup
rm db.sqlite3-wal
rm db.sqlite3-shm
pm2 restart insta-reel-bot
```

### Native bindings error
```bash
# Rebuild native bindings
pnpm rebuild better-sqlite3
```

### Telegram connection error
- Verify `BOT_TOKEN` is correct
- Ensure internet connectivity
- Check if another bot instance is running

## 📞 Support

For issues during deployment:
1. Check logs: `pm2 logs insta-reel-bot`
2. Verify environment variables
3. Ensure database file is accessible
4. Check Telegram API connectivity

## Version History

- **v1.1.0** (Current)
  - Admin features and analytics
  - Database file_id optimization
  - TypeScript improvements
  - Fixed native bindings for ARM64

- **v1.0.0** (Previous)
  - Initial stable release
  - Basic video download and persistence
  - Cron backup functionality
