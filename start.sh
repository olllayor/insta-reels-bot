#!/bin/sh
echo "Starting Instagram Reels Bot with Cron..."

# Start the cron job in the background
echo "Starting cron job..."
pnpm cron &
CRON_PID=$!

# Start the bot in the foreground
echo "Starting bot..."
pnpm start &
BOT_PID=$!

# Function to handle shutdown
shutdown() {
  echo "Shutting down..."
  kill $CRON_PID $BOT_PID
  wait $CRON_PID $BOT_PID
  exit 0
}

# Trap signals
trap shutdown SIGTERM SIGINT

# Wait for both processes
wait $BOT_PID $CRON_PID
