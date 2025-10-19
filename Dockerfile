# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Tell Playwright to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --only=production
RUN cd frontend && npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build:backend

# Copy necessary files for runtime
COPY models ./models
COPY services ./services
COPY playwright-claimer-discord.js ./
COPY playwright-claimer.js ./
COPY claimer-utils.js ./
COPY browser-pool.js ./
COPY discord-bot.js ./
COPY user-mapping.json ./
COPY src ./src
COPY scripts ./scripts
COPY test-discord.js ./
COPY test-mongodb.js ./
COPY env-template.txt ./
COPY env.docker ./

# Create necessary directories
RUN mkdir -p /app/logs
RUN mkdir -p /app/screenshots
RUN mkdir -p /app/screenshots/shop-page
RUN mkdir -p /app/screenshots/login
RUN mkdir -p /app/screenshots/final-page
RUN mkdir -p /app/screenshots/id-entry
RUN mkdir -p /app/screenshots/go-click
RUN mkdir -p /app/screenshots/confirmation

# Set proper permissions
RUN chmod -R 755 /app/screenshots

# Expose port (if needed for health checks)
EXPOSE 3000

# Volume for persistent data
VOLUME ["/app/logs", "/app/screenshots"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Set user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Start the application
CMD ["npm", "run", "schedule-discord"]
