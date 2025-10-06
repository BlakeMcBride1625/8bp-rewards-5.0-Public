#!/bin/bash

# MongoDB Setup Script for 8BP Reward Bot
# This script helps you set up MongoDB for the project

echo "🚀 MongoDB Setup for 8BP Reward Bot"
echo "=================================="
echo ""

# Check if MongoDB is already installed
if command -v mongod &> /dev/null; then
    echo "✅ MongoDB is already installed"
    mongod --version
    echo ""
else
    echo "❌ MongoDB is not installed"
    echo ""
    echo "📋 Installation Options:"
    echo "1. Install MongoDB locally"
    echo "2. Use MongoDB Atlas (cloud) - Recommended for VPS"
    echo ""
    read -p "Choose option (1 or 2): " choice
    
    case $choice in
        1)
            echo "📦 Installing MongoDB locally..."
            
            # Detect OS
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS
                echo "🍎 Detected macOS"
                if command -v brew &> /dev/null; then
                    echo "📦 Installing via Homebrew..."
                    brew tap mongodb/brew
                    brew install mongodb-community
                    echo "✅ MongoDB installed via Homebrew"
                else
                    echo "❌ Homebrew not found. Please install Homebrew first:"
                    echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
                    exit 1
                fi
            elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
                # Linux
                echo "🐧 Detected Linux"
                echo "📦 Installing via apt..."
                wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
                echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
                sudo apt-get update
                sudo apt-get install -y mongodb-org
                echo "✅ MongoDB installed via apt"
            else
                echo "❌ Unsupported OS: $OSTYPE"
                echo "Please install MongoDB manually from: https://www.mongodb.com/try/download/community"
                exit 1
            fi
            ;;
        2)
            echo "☁️  MongoDB Atlas Setup"
            echo "======================"
            echo ""
            echo "1. Go to https://www.mongodb.com/atlas"
            echo "2. Create a free account"
            echo "3. Create a new cluster (free tier)"
            echo "4. Get your connection string"
            echo "5. Update your .env file with:"
            echo "   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/8bp-rewards"
            echo ""
            echo "🔒 Make sure to replace username:password with your actual credentials"
            echo "🔒 And replace cluster.mongodb.net with your actual cluster URL"
            echo ""
            echo "✅ Once you've updated .env, run: node test-mongodb.js"
            exit 0
            ;;
        *)
            echo "❌ Invalid choice. Please run the script again and choose 1 or 2."
            exit 1
            ;;
    esac
fi

# Start MongoDB service
echo ""
echo "🔄 Starting MongoDB service..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    brew services start mongodb-community
    echo "✅ MongoDB started via Homebrew"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    sudo systemctl start mongod
    sudo systemctl enable mongod
    echo "✅ MongoDB started via systemctl"
else
    echo "⚠️  Please start MongoDB manually for your OS"
fi

# Wait a moment for MongoDB to start
echo "⏳ Waiting for MongoDB to start..."
sleep 3

# Test connection
echo ""
echo "🧪 Testing MongoDB connection..."
if node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/8bp-rewards', { serverSelectionTimeoutMS: 3000 })
  .then(() => { console.log('✅ MongoDB connection successful'); process.exit(0); })
  .catch(err => { console.log('❌ MongoDB connection failed:', err.message); process.exit(1); });
"; then
    echo ""
    echo "🎉 MongoDB setup complete!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Run: node test-mongodb.js"
    echo "2. Run: node scripts/migrate-to-mongodb.js"
    echo "3. Run: npm run bot"
    echo ""
    echo "💡 Your .env file should have:"
    echo "   MONGODB_URI=mongodb://localhost:27017/8bp-rewards"
else
    echo ""
    echo "❌ MongoDB connection failed"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "1. Check if MongoDB is running: ps aux | grep mongod"
    echo "2. Check MongoDB logs"
    echo "3. Try starting manually: mongod --dbpath /usr/local/var/mongodb"
    echo "4. Or use MongoDB Atlas (cloud) instead"
fi

