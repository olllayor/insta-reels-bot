#!/bin/sh
set -e
echo "Starting Instagram Reels Bot with Cron..."

# Load .env if present (without exporting empty vars)
if [ -f ".env" ]; then
  echo "Loading .env"
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | xargs -I{} echo {})
fi

echo "Starting cron and bot..."
pnpm cron &
CRON_PID=$!

pnpm start &
BOT_PID=$!

shutdown() {
  echo "Shutting down..."
  kill "$CRON_PID" "$BOT_PID" 2>/dev/null || true
  wait "$CRON_PID" "$BOT_PID" 2>/dev/null || true
  exit 0
}

trap shutdown SIGTERM SIGINT

wait "$BOT_PID" "$CRON_PID"
