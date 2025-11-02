# Use a more compatible base image with Python and build tools
FROM node:20-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache \
  python3 \
  make \
  g++ \
  sqlite \
  sqlite-dev

# Create app directory
WORKDIR /app

# Enable corepack and activate the exact pnpm version from package.json
RUN corepack enable \
  && corepack prepare pnpm@10.13.1 --activate

# Install dependencies first (better caching)
COPY package.json pnpm-lock.yaml ./

# Install dependencies and rebuild better-sqlite3
RUN pnpm install --frozen-lockfile

# Rebuild better-sqlite3 explicitly (npm works better for native modules)
RUN cd /app && npm rebuild better-sqlite3 --build-from-source

# Copy the rest of the source code
COPY . .

# Create data directory for database with proper permissions
RUN mkdir -p /app/data && chmod 755 /app/data

# Set environment to production at runtime
ENV NODE_ENV=production

# Make start script executable
RUN chmod +x /app/start.sh

# Change ownership of app directory to node user
RUN chown -R node:node /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

# Run as non-root user for safety
USER node

# Start both bot and cron
# Note: Docker will load .env with --env-file, which strips quotes automatically
CMD ["./start.sh"]
