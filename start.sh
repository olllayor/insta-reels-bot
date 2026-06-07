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
bun run cron.ts &
CRON_PID=$!
echo "[START] Cron PID: $CRON_PID"

# Start bot in background
echo "[START] Starting bot..."
bun run bot.ts &
BOT_PID=$!
echo "[START] Bot PID: $BOT_PID"

# Handle shutdown gracefully
SHUTDRAIN_TIMEOUT_SEC=${SHUTDRAIN_TIMEOUT_SEC:-35}
shutdown() {
  echo "[SHUTDOWN] Received signal, shutting down (drain timeout=${SHUTDRAIN_TIMEOUT_SEC}s)..."

  # Ask the bot to drain in-flight updates first.
  kill -TERM "$BOT_PID" 2>/dev/null || true
  kill -TERM "$CRON_PID" 2>/dev/null || true

  # Wait for the bot to exit on its own (it does an internal drain via SIGTERM).
  wait "$BOT_PID" 2>/dev/null
  BOT_EXIT=$?
  BOT_WAITED=$((SECONDS - SHUTDOWN_START))

  # Force-kill cron if it didn't exit in time.
  if kill -0 "$CRON_PID" 2>/dev/null; then
    wait "$CRON_PID" 2>/dev/null
  fi

  if [ "$BOT_EXIT" -ne 0 ] && [ "$BOT_WAITED" -ge "$SHUTDRAIN_TIMEOUT_SEC" ]; then
    echo "[SHUTDOWN] Drain timeout exceeded; force-killing bot"
    kill -KILL "$BOT_PID" 2>/dev/null || true
  fi

  echo "[SHUTDOWN] Done."
  exit 0
}

# Capture shutdown start time so the trap can compute elapsed drain time.
SHUTDOWN_START=$SECONDS
trap 'SHUTDOWN_START=$SECONDS; shutdown' TERM INT

echo "[START] Both processes running. Press Ctrl+C to stop."

# Wait for both processes
# If either dies, the script exits (set -e) and container restarts
wait "$BOT_PID" "$CRON_PID" 2>/dev/null || {
  EXIT_CODE=$?
  echo "[ERROR] A process exited with code $EXIT_CODE"
  exit "$EXIT_CODE"
}
