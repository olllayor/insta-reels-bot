# Insta Reel Bot

Telegram bot that takes an Instagram Reel or Story link and replies with the video file (no URL shown).

## Features

- Instagram Reels downloader (video only)
- Instagram Stories downloader (video only)
- Sends back the video file directly
- Basic Instagram URL validation

## Future features

- Other Instagram media types (posts, carousels, IGTV/live replays where applicable)
- Improved error handling and retries
- Rate limiting and admin-only mode

## Environment

Create a `.env` file with:

```bash
BOT_TOKEN=<your_telegram_bot_token>
API_ENDPOINT=<your_downloader_service_url>
ADMIN_CHAT_ID=<numeric_chat_id_for_backups>
DB_PATH=<path_to_db_file>
# Optional, default 5 hours
CRON_INTERVAL_HOURS=5
```

## Run

Install deps and start the bot:

```bash
pnpm install
pnpm start
```

Send a Reel or Story URL to your bot in Telegram to receive the video.

## Cron DB Backup

A lightweight worker `cron.ts` can periodically send your database file to the admin chat (default every 5 hours).

Start it (alongside the main bot):

```bash
pnpm run cron
```

It sends immediately on start, then on the configured interval. Set `CRON_INTERVAL_HOURS` to change cadence. The backup is sent as a zipped `.zip` file (falls back to raw DB if compression fails).

## Database

The bot stores basic user info and downloaded video URLs in a local SQLite file (default `./db.sqlite3` if `DB_PATH` not set).

Tables:

- users: telegram_id (unique), username, full_name, phone (reserved), first_seen, last_seen
- videos: user_id (FK), url (served CDN link), original_url (Instagram link), created_at

On each successful download the bot upserts the user and inserts a video record.
