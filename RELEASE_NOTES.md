# Release v1.1.0 - Admin Features & Database Optimization

## 🎉 Major Features

### Admin Dashboard Commands
- **/admin** - Quick analytics dashboard with user and video statistics
- **/stats** - Detailed engagement metrics and activity rates
- **/help** - Dynamic command help (admin-only commands hidden from regular users)

### Admin Analytics Include:
- Total users and videos count
- Today's logins and weekly logins
- Daily and weekly active users
- Engagement rates (login rate, activity rate)
- Top 10 most active users by video count
- Average videos per user

### Database Enhancements
- Added `file_id` column to videos table for efficient video reuse
- Improved schema with automatic migrations
- Better data persistence with file_id capture from channel forwards

### Bug Fixes & Improvements
- Fixed better-sqlite3 native bindings compilation for ARM64 macOS
- Pure TypeScript project without compiled JS files
- Improved import resolution with .js extensions for nodenext module resolution
- Enhanced error handling in downloader and database operations
- Added proper ESM/CommonJS interop using createRequire

## 📋 Setup Requirements

### Environment Variables
```env
BOT_TOKEN=your_bot_token
API_ENDPOINT=your_cobalt_api_endpoint
ADMIN_ID=your_admin_telegram_id
ADMIN_CHAT_ID=your_admin_chat_id
DB_PATH=db.sqlite3
CRON_INTERVAL_HOURS=4
TELEGRAM_CHANNEL_ID=your_channel_id
DOWNLOADER_TIMEOUT_MS=20000
```

### Admin Setup
1. Set `ADMIN_ID` to your Telegram user ID in `.env`
2. Run `/admin` or `/stats` commands to view analytics
3. These commands are only accessible to the admin user

## 🚀 Deployment

### Prerequisites
- Node.js 20.x, 22.x, 23.x, or 24.x
- pnpm 10.13.1+

### Installation
```bash
pnpm install
pnpm rebuild better-sqlite3  # For native bindings
```

### Running
```bash
pnpm start      # Production mode
pnpm dev        # Development with file watching
pnpm cron       # Run cron job for database backups
```

## 📊 Database Schema

### Users Table
- id: Auto-incrementing primary key
- telegram_id: Unique Telegram user ID
- username: Optional Telegram username
- full_name: User's full name
- phone: Optional phone number
- first_seen: User's first interaction timestamp
- last_seen: User's last interaction timestamp

### Videos Table
- id: Auto-incrementing primary key
- user_id: Foreign key to users table
- user_ref: Denormalized username or telegram_id
- url: Video download URL
- original_url: Original Instagram/Twitter URL
- file_id: Telegram file_id for cached videos
- created_at: Video processing timestamp

## 🔧 Technical Details

- **Runtime**: tsx (TypeScript execution without compilation)
- **Database**: SQLite 3 with WAL journal mode
- **Telegram API**: Grammy v1.38.1
- **Video Download**: Cobalt API integration
- **Module System**: ESM with proper CommonJS interop

## ✅ Testing Checklist

- [x] Bot initializes without errors
- [x] Database persists user and video data
- [x] Videos forwarded to channel with file_id capture
- [x] Admin commands work and show correct statistics
- [x] TypeScript compilation passes without errors
- [x] Native bindings compile for target platform

## 🐛 Known Issues
None at this time.

## 📝 Migration from Previous Versions
If upgrading from v1.0.0, the following migration will run automatically:
- New `file_id` column will be added to the videos table
- All existing videos will have NULL file_id until new videos are processed

## 📞 Support
For issues or questions, contact the admin user via `/stats` or `/admin` commands.
