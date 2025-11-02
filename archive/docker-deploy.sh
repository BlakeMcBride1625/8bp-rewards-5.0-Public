#!/bin/bash

# Docker Deployment Script for 8BP Rewards
# This script helps deploy the application to your VPS

echo "🐳 8BP Rewards Docker Deployment"
echo "================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found!"
    echo ""
    echo "📋 Creating .env from template..."
    
    if [ -f "env.docker" ]; then
        cp env.docker .env
        echo "✅ Created .env from env.docker template"
        echo ""
        echo "🔧 Please edit .env file with your actual values:"
        echo "   - MONGO_ROOT_PASSWORD: Set a secure password"
        echo "   - DISCORD_TOKEN: Your Discord bot token"
        echo "   - DISCORD_CHANNEL_ID: Your Discord channel ID"
        echo "   - DISCORD_GUILD_ID: Your Discord server ID"
        echo "   - USER_IDS: Your 8BP user IDs"
        echo ""
        read -p "Press Enter after you've configured .env file..."
    else
        echo "❌ env.docker template not found!"
        exit 1
    fi
fi

echo "📋 Deployment Options:"
echo "1. Build and start services (first time)"
echo "2. Start existing services"
echo "3. Restart services"
echo "4. Stop services"
echo "5. View logs"
echo "6. Clean up (remove containers and volumes)"
echo "7. Update and restart"
echo ""

read -p "Select option (1-7): " choice

case $choice in
    1)
        echo "🔨 Building and starting services..."
        docker-compose build
        docker-compose up -d
        echo ""
        echo "✅ Services started!"
        echo "📊 Check status: docker-compose ps"
        echo "📋 View logs: docker-compose logs -f"
        ;;
    2)
        echo "▶️ Starting services..."
        docker-compose up -d
        echo "✅ Services started!"
        ;;
    3)
        echo "🔄 Restarting services..."
        docker-compose restart
        echo "✅ Services restarted!"
        ;;
    4)
        echo "⏹️ Stopping services..."
        docker-compose down
        echo "✅ Services stopped!"
        ;;
    5)
        echo "📋 Viewing logs (Ctrl+C to exit)..."
        docker-compose logs -f
        ;;
    6)
        echo "⚠️  This will remove all containers and volumes (data will be lost)!"
        read -p "Are you sure? (y/N): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            docker-compose down -v
            docker system prune -f
            echo "✅ Cleanup completed!"
        else
            echo "❌ Cleanup cancelled"
        fi
        ;;
    7)
        echo "🔄 Updating and restarting..."
        docker-compose down
        docker-compose build --no-cache
        docker-compose up -d
        echo "✅ Update completed!"
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment operation completed!"
echo ""
echo "📋 Useful commands:"
echo "   docker-compose ps                    # Check service status"
echo "   docker-compose logs -f               # View live logs"
echo "   docker-compose exec app /bin/sh      # Access app container"
echo "   docker-compose exec mongodb mongosh  # Access MongoDB"

