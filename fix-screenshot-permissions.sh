#!/bin/bash
# Fix screenshot permissions for 8BP Rewards
sudo chown -R blake:blake screenshots
sudo chmod -R 755 screenshots
echo "✅ Screenshot permissions fixed"
