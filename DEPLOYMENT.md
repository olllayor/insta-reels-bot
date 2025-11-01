# Deployment Guide - v1.1.0

## 🚀 Server Deployment Steps

### Step 1: Stop Running Bot Instance
```bash
# On your server, stop the currently running bot
pm2 stop insta-reel-bot
# or if running directly
pkill -f "tsx bot.ts"
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
pnpm install
```

### Step 4: Rebuild Native Bindings
```bash
# This is crucial for the better-sqlite3 module
pnpm rebuild better-sqlite3
```

### Step 5: Verify Installation
```bash
# Check TypeScript compilation
pnpm build  # if build script exists, or
npx tsc --noEmit

# Test bot startup (Ctrl+C after confirming initialization)
pnpm start
```

### Step 6: Start Bot with Process Manager
```bash
# Using pm2
pm2 restart insta-reel-bot
# or
pm2 start --name insta-reel-bot "pnpm start"

# Start cron job
pm2 start --name insta-reel-cron "pnpm cron" --cron "0 */4 * * *"
```

### Step 7: Verify Running
```bash
# Check bot is running
pm2 list

# View logs
pm2 logs insta-reel-bot
pm2 logs insta-reel-cron
```

## 📋 Pre-Deployment Checklist

- [ ] Database backup created (if upgrading from v1.0.0)
- [ ] `.env` file updated with all required variables including `ADMIN_ID`
- [ ] Server has Node.js 20.x or higher installed
- [ ] pnpm is installed on server
- [ ] Python 3 is available (needed for native binding compilation)
- [ ] Previous bot instance is stopped
- [ ] Telegram bot token is valid
- [ ] Channel access permissions are configured

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

1. **Send test message to bot**
   - Send `/start` command
   - Verify "Send me an Instagram Reel link" response

2. **Test admin commands**
   - Send `/admin` to verify stats display
   - Send `/stats` for detailed metrics
   - Send `/help` to see available commands

3. **Test video download**
   - Send a valid Instagram Reel URL
   - Verify video is sent to user
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
