# Use official Bun image with Alpine base
FROM oven/bun:1-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache \
  python3 \
  make \
  g++ \
  sqlite \
  sqlite-dev

# Create app directory
WORKDIR /app

# Install dependencies first (better caching)
COPY package.json bun.lock ./

# Install dependencies with Bun (automatically handles native modules)
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Create data directory for database with proper permissions
RUN mkdir -p /app/data && chmod 755 /app/data

# Set environment to production at runtime
ENV NODE_ENV=production

# Make start script executable
RUN chmod +x /app/start.sh

# Change ownership of app directory to node user
RUN chown -R bun:bun /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun --version || exit 1

# Run as non-root user for safety
USER bun

# Start both bot and cron
# Note: Docker will load .env with --env-file, which strips quotes automatically
CMD ["./start.sh"]
