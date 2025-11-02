#!/bin/sh
set -euo

echo "[START] Initializing Instagram Reels Bot with Cron..."

# Load .env if present
if [ -f ".env" ]; then
  echo "[START] Loading .env..."
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | xargs)
fi

# Validate critical env vars
if [ -z "${BOT_TOKEN:-}" ]; then
  echo "[ERROR] BOT_TOKEN not set in .env. Exiting."
  exit 1
fi

if [ -z "${ADMIN_CHAT_ID:-}" ]; then
  echo "[ERROR] ADMIN_CHAT_ID not set in .env. Cron will fail. Exiting."
  exit 1
fi

# Start cron in background
echo "[START] Starting cron job (interval: ${CRON_INTERVAL_HOURS:-5}h)..."
pnpm cron &
CRON_PID=$!
echo "[START] Cron PID: $CRON_PID"

# Start bot in background
echo "[START] Starting bot..."
pnpm start &
BOT_PID=$!
echo "[START] Bot PID: $BOT_PID"

# Handle shutdown gracefully
shutdown() {
  echo "[SHUTDOWN] Received signal, shutting down..."
  kill "$CRON_PID" 2>/dev/null || true
  kill "$BOT_PID" 2>/dev/null || true
  wait "$CRON_PID" "$BOT_PID" 2>/dev/null || true
  echo "[SHUTDOWN] Done."
  exit 0
}

trap shutdown SIGTERM SIGINT

echo "[START] Both processes running. Press Ctrl+C to stop."

# Wait for both processes
# If either dies, the script exits (set -e) and container restarts
wait "$BOT_PID" "$CRON_PID" 2>/dev/null || {
  EXIT_CODE=$?
  echo "[ERROR] A process exited with code $EXIT_CODE"
  exit "$EXIT_CODE"
}
