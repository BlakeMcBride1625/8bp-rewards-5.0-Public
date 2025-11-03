# Multi-stage build for all services
FROM node:20-alpine AS builder

# Install build dependencies including canvas requirements
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

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
RUN npm ci
RUN npm run build
WORKDIR /app

# Production stage
FROM node:20-alpine

# Install runtime dependencies including Playwright/Chromium and build dependencies for native modules
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
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Install Playwright Chromium (without system deps since we use Alpine's chromium)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install chromium

# Copy built backend
COPY --from=builder /app/dist ./dist

# Copy frontend build
COPY --from=builder /app/frontend/build ./frontend/build

# Copy all necessary source files for runtime
COPY backend/ ./backend/
COPY models/ ./models/
COPY services/ ./services/

# Also copy services to dist for path resolution (backend code expects it there)
RUN mkdir -p /app/dist/services && cp -r /app/services/* /app/dist/services/ || true
COPY playwright-claimer.js ./
COPY playwright-claimer-discord.js ./
COPY claimer-utils.js ./
COPY browser-pool.js ./

# Create necessary directories
RUN mkdir -p /app/logs /app/backend/logs /app/screenshots /app/backend/screenshots

# Set environment variables
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

# Expose ports (all services use the same image)
EXPOSE 2600 2700

# Default command (will be overridden in docker-compose)
CMD ["node", "dist/backend/backend/src/server.js"]

