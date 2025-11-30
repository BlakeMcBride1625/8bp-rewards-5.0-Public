# Multi-stage build for all services
FROM node:20-alpine AS builder

# Install build dependencies including canvas requirements and verification bot dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    openssl \
    openssl-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy backend source
COPY backend/ ./backend/
COPY models/ ./models/
COPY services/ ./services/

# Build backend
RUN npm run build:backend

# Build frontend
COPY frontend/ ./frontend/
WORKDIR /app/frontend
# Set REACT_APP_* variables for production build
# Must be set before npm run build so they're baked into the bundle
ENV REACT_APP_API_URL=/8bp-rewards/api
ARG REACT_APP_DISCORD_INVITE_URL
ENV REACT_APP_DISCORD_INVITE_URL=${REACT_APP_DISCORD_INVITE_URL}
ARG REACT_APP_SOCIAL_FACEBOOK
ENV REACT_APP_SOCIAL_FACEBOOK=${REACT_APP_SOCIAL_FACEBOOK}
ARG REACT_APP_SOCIAL_TIKTOK
ENV REACT_APP_SOCIAL_TIKTOK=${REACT_APP_SOCIAL_TIKTOK}
ARG REACT_APP_SOCIAL_YOUTUBE
ENV REACT_APP_SOCIAL_YOUTUBE=${REACT_APP_SOCIAL_YOUTUBE}
ARG REACT_APP_SOCIAL_DISCORD
ENV REACT_APP_SOCIAL_DISCORD=${REACT_APP_SOCIAL_DISCORD}
ARG REACT_APP_SOCIAL_INSTAGRAM
ENV REACT_APP_SOCIAL_INSTAGRAM=${REACT_APP_SOCIAL_INSTAGRAM}
ARG REACT_APP_SOCIAL_X
ENV REACT_APP_SOCIAL_X=${REACT_APP_SOCIAL_X}
ARG REACT_APP_SOCIAL_TELEGRAM
ENV REACT_APP_SOCIAL_TELEGRAM=${REACT_APP_SOCIAL_TELEGRAM}
RUN npm ci
RUN npm run build
WORKDIR /app

# Build discord-status-bot
COPY discord-status-bot/ ./discord-status-bot/
WORKDIR /app/discord-status-bot
RUN npm ci
RUN npm run build
WORKDIR /app

# Build verification bot
COPY services/verification-bot/package*.json ./services/verification-bot/
COPY services/verification-bot/tsconfig.json ./services/verification-bot/
WORKDIR /app/services/verification-bot
RUN npm ci
# Copy verification bot source and Prisma schema
COPY services/verification-bot/src ./src/
COPY services/verification-bot/prisma ./prisma/
# Generate Prisma client
RUN npx prisma generate
# Build TypeScript
RUN npm run build
WORKDIR /app

# Production stage
FROM node:20-alpine

# Install runtime dependencies including Playwright/Chromium, build dependencies for native modules, and verification bot dependencies
RUN apk add --no-cache \
    wget \
    curl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    openssl \
    openssl-dev \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Install Playwright Chromium - use system chromium from Alpine instead of downloading
# This saves ~170MB download and ~5-10 minutes of build time
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Use Alpine's chromium instead - already installed above
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
RUN mkdir -p /ms-playwright || true

# Copy built backend
COPY --from=builder /app/dist ./dist

# Copy frontend build
COPY --from=builder /app/frontend/build ./frontend/build

# Copy built discord-status-bot
COPY --from=builder /app/discord-status-bot/dist ./discord-status-bot/dist
COPY --from=builder /app/discord-status-bot/node_modules ./discord-status-bot/node_modules

# Copy built verification bot
COPY --from=builder /app/services/verification-bot/dist ./services/verification-bot/dist
COPY --from=builder /app/services/verification-bot/node_modules ./services/verification-bot/node_modules
COPY --from=builder /app/services/verification-bot/prisma ./services/verification-bot/prisma

# Copy all necessary source files for runtime
COPY backend/ ./backend/
COPY models/ ./models/
COPY services/ ./services/
COPY discord-status-bot/ ./discord-status-bot/

# Also copy services to dist for path resolution (backend code expects it there)
RUN mkdir -p /app/dist/services && cp -r /app/services/* /app/dist/services/ || true
COPY playwright-claimer.js ./
COPY playwright-claimer-discord.js ./
COPY first-time-claim.js ./
COPY claimer-utils.js ./
COPY browser-pool.js ./

# Create necessary directories
RUN mkdir -p /app/logs /app/backend/logs /app/screenshots /app/backend/screenshots /app/assets

# Set environment variables
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Expose ports (all services use the same image)
EXPOSE 2600 2700

# Default command (will be overridden in docker-compose)
CMD ["node", "dist/backend/backend/src/server.js"]

