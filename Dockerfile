# Lightweight Node.js base image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Enable corepack and activate the exact pnpm version from package.json
RUN corepack enable \
  && corepack prepare pnpm@10.13.1 --activate

# Install dependencies first (better caching)
COPY package.json pnpm-lock.yaml ./
# We explicitly install dev deps because the app runs with tsx (a devDependency)
RUN pnpm install --frozen-lockfile --prod=false

# Copy the rest of the source code
COPY . .

# Set environment to production at runtime
ENV NODE_ENV=production

# Run as non-root user for safety
USER node

# Start the Telegram bot
# Required envs at runtime: BOT_TOKEN, API_ENDPOINT
CMD ["pnpm", "start"]


