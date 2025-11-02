#!/bin/bash

echo "🐳 Migrating 8BP Rewards to Docker"
echo "=================================="

# Stop systemd services
echo ""
echo "1️⃣ Stopping systemd services..."
sudo systemctl stop 8bp-rewards-backend.service
sudo systemctl stop 8bp-rewards-discord.service

echo "✅ Systemd services stopped"

# Disable systemd services (so they don't start on boot)
echo ""
echo "2️⃣ Disabling systemd services..."
sudo systemctl disable 8bp-rewards-backend.service
sudo systemctl disable 8bp-rewards-discord.service

echo "✅ Systemd services disabled"

# Build Docker images
echo ""
echo "3️⃣ Building Docker images..."
docker-compose build

echo "✅ Docker images built"

# Start Docker containers
echo ""
echo "4️⃣ Starting Docker containers..."
docker-compose up -d

echo "✅ Docker containers started"

# Wait for services to be healthy
echo ""
echo "5️⃣ Waiting for services to be healthy..."
sleep 10

# Check status
echo ""
echo "6️⃣ Checking service status..."
docker-compose ps

echo ""
echo "=================================="
echo "✅ Migration complete!"
echo ""
echo "📊 Useful commands:"
echo "  - View logs:        docker-compose logs -f"
echo "  - View backend:     docker-compose logs -f backend"
echo "  - View Discord bot: docker-compose logs -f discord-bot"
echo "  - Stop all:         docker-compose down"
echo "  - Restart:          docker-compose restart"
echo ""





