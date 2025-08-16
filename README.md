# Insta Reel Bot

Telegram bot that takes an Instagram Reel link and replies with the video file (no URL shown).

## Features

- Instagram Reels downloader (video only)
- Sends back the video file directly
- Basic Instagram URL validation

## Future features

- Instagram Stories support
- Other Instagram media types (posts, carousels, IGTV/live replays where applicable)
- Improved error handling and retries
- Rate limiting and admin-only mode

## Environment

Create a `.env` file with:

```bash
BOT_TOKEN=<your_telegram_bot_token>
API_ENDPOINT=<your_downloader_service_url>
```

## Run

Install deps and start the bot:

```bash
pnpm install
pnpm start
```

Send a Reel URL to your bot in Telegram to receive the video.
# insta-reels-bot
