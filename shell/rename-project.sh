#!/bin/bash

# Project Rename Script
# This script helps rename the project from 8bp-wev-hook to 8bp-rewards
# NOTE: Project is already renamed to 8bp-rewards

echo "✅ Project Name Verification - 8bp-rewards"
echo "=================================================="
echo ""

# Get current directory name
CURRENT_DIR=$(basename "$PWD")
echo "📁 Current directory: $CURRENT_DIR"

if [ "$CURRENT_DIR" = "8bp-wev-hook" ]; then
    echo "✅ Found project directory: $CURRENT_DIR"
    echo ""
    
    # Get parent directory
    PARENT_DIR=$(dirname "$PWD")
    NEW_PATH="$PARENT_DIR/8bp-rewards"
    
    echo "📋 Rename Plan:"
    echo "   From: $PWD"
    echo "   To:   $NEW_PATH"
    echo ""
    
    read -p "🤔 Do you want to rename the directory? (y/n): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        echo ""
        echo "🔄 Renaming directory..."
        
        # Navigate to parent directory
        cd "$PARENT_DIR"
        
        # Rename the directory
        mv "8bp-wev-hook" "8bp-rewards"
        
        if [ $? -eq 0 ]; then
            echo "✅ Directory renamed successfully!"
            echo ""
            echo "📁 New path: $NEW_PATH"
            echo ""
            echo "📋 Next steps:"
            echo "1. cd $NEW_PATH"
            echo "2. npm run setup-mongodb"
            echo "3. npm run test-mongodb"
            echo "4. npm run migrate-mongodb"
            echo "5. npm run bot"
            echo ""
            echo "🎉 Project successfully renamed to 8bp-rewards!"
        else
            echo "❌ Failed to rename directory"
            exit 1
        fi
    else
        echo "❌ Rename cancelled"
        exit 0
    fi
    
elif [ "$CURRENT_DIR" = "8bp-rewards" ]; then
    echo "✅ Project is correctly named 8bp-rewards!"
    echo ""
    echo "📋 Available commands:"
    echo "   npm install              # Install dependencies"
    echo "   npm run build            # Build TypeScript"
    echo "   npm run setup-mongodb    # Set up MongoDB"
    echo "   npm run test-mongodb     # Test database"
    echo "   npm run migrate-mongodb  # Migrate from JSON"
    echo "   npm run bot              # Start Discord bot"
    echo "   npm run claim            # Run claimer once"
    echo "   npm run schedule         # Run with scheduling"
    
else
    echo "⚠️  This doesn't appear to be the 8bp project directory"
    echo "   Current directory: $CURRENT_DIR"
    echo "   Expected: 8bp-wev-hook or 8bp-rewards"
    echo ""
    echo "💡 Make sure you're in the correct project directory"
    exit 1
fi

