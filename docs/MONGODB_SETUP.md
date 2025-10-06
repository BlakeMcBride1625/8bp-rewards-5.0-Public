# MongoDB Setup Guide

This guide will help you set up MongoDB for the 8BP Reward Bot to store user mappings persistently with backup capabilities.

## 🎯 Why MongoDB?

- **Persistent Storage**: User data survives bot restarts and server reboots
- **Automatic Backups**: Built-in backup functionality to JSON files
- **Scalability**: Can handle thousands of users efficiently
- **No Image Storage**: Images are temporary files only - never stored in database
- **Override Protection**: Prevents duplicate 8BP IDs across different Discord users

## 🚀 Quick Setup

### Option 1: Automated Setup (Recommended)

```bash
# Run the automated setup script
npm run setup-mongodb
```

This script will:
- Detect your operating system
- Install MongoDB if needed
- Start the MongoDB service
- Test the connection
- Provide next steps

### Option 2: Manual Setup

#### For Local Development (macOS/Linux)

```bash
# macOS with Homebrew
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Linux (Ubuntu/Debian)
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### For Production/VPS (MongoDB Atlas - Recommended)

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free account
3. Create a new cluster (free tier available)
4. Get your connection string
5. Update your `.env` file:

```env
# For MongoDB Atlas (cloud)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/8bp-rewards

# For local MongoDB
MONGODB_URI=mongodb://localhost:27017/8bp-rewards
```

## 🧪 Testing Your Setup

```bash
# Test MongoDB connection and operations
npm run test-mongodb
```

This will test:
- ✅ Database connection
- ✅ User addition/updates
- ✅ User lookups
- ✅ Claim statistics
- ✅ Backup functionality
- ✅ Cleanup operations

## 📊 Migration from JSON

If you have existing user data in `user-mapping.json`:

```bash
# Migrate existing data to MongoDB
npm run migrate-mongodb
```

This will:
- ✅ Create backup of existing JSON file
- ✅ Migrate all users to MongoDB
- ✅ Handle conflicts automatically
- ✅ Create database backup
- ✅ Verify migration success

## 📋 Available Commands

```bash
# MongoDB setup and testing
npm run setup-mongodb      # Automated MongoDB setup
npm run test-mongodb       # Test database operations
npm run migrate-mongodb    # Migrate from JSON to MongoDB

# Bot operations
npm run bot                # Start Discord bot with MongoDB
npm run claim-discord      # Manual claim with Discord confirmations
npm run schedule-discord   # Scheduled claims with Discord confirmations
```

## 🔧 Configuration

### Environment Variables

Add to your `.env` file:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/8bp-rewards

# For MongoDB Atlas (replace with your credentials)
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/8bp-rewards
```

### Database Structure

The MongoDB database stores:

```javascript
{
  discordId: "123456789012345678",     // Discord user ID
  bpAccountId: "3057211056",          // 8 Ball Pool account ID
  username: "PlayerName",             // Display name
  createdAt: "2024-01-01T00:00:00Z",  // Registration date
  updatedAt: "2024-01-01T00:00:00Z",  // Last update
  lastClaimed: "2024-01-01T12:00:00Z", // Last claim date
  totalClaims: 5                      // Total number of claims
}
```

**Note**: Images are NOT stored in the database - only temporary files that get deleted after sending to Discord.

## 🛡️ Security & Access Control

- **Unique Constraints**: Each Discord ID and 8BP ID can only be registered once
- **Override Protection**: Adding a new user automatically removes conflicting old entries
- **Access Control**: Only special users can use Discord commands
- **Data Validation**: All inputs are validated before database storage

## 💾 Backup & Recovery

### Automatic Backups

The system automatically creates backups:

```bash
# Manual backup
node -e "
const DatabaseService = require('./services/database-service');
const db = new DatabaseService();
db.connect().then(() => db.backupToFile('manual-backup.json'));
"
```

### Backup Files

Backups are saved as JSON files with:
- Timestamp
- Total user count
- All user data
- Database metadata

### Recovery

To restore from backup:

```bash
# The migration script can also restore from backup
node scripts/migrate-to-mongodb.js rollback
```

## 🔍 Monitoring & Maintenance

### Health Check

```bash
# Check database health
node -e "
const DatabaseService = require('./services/database-service');
const db = new DatabaseService();
db.connect().then(() => {
  db.healthCheck().then(health => console.log(health));
});
"
```

### Database Statistics

```bash
# View user statistics
node -e "
const DatabaseService = require('./services/database-service');
const db = new DatabaseService();
db.connect().then(async () => {
  const users = await db.getAllUsers();
  console.log('Total users:', users.length);
  users.forEach(user => {
    console.log(\`\${user.username}: \${user.totalClaims} claims\`);
  });
});
"
```

## 🚨 Troubleshooting

### Connection Issues

```bash
# Check if MongoDB is running
ps aux | grep mongod

# Check MongoDB logs (macOS)
tail -f /usr/local/var/log/mongodb/mongo.log

# Check MongoDB logs (Linux)
tail -f /var/log/mongodb/mongod.log
```

### Common Errors

1. **Connection Refused**: MongoDB not running
   ```bash
   # Start MongoDB
   brew services start mongodb-community  # macOS
   sudo systemctl start mongod            # Linux
   ```

2. **Authentication Failed**: Wrong credentials in connection string
   ```bash
   # Check your .env file
   cat .env | grep MONGODB_URI
   ```

3. **Database Not Found**: Database will be created automatically on first use

### Reset Database

```bash
# Clear all data (use with caution!)
node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/8bp-rewards').then(() => {
  mongoose.connection.db.dropDatabase().then(() => {
    console.log('Database cleared');
    process.exit(0);
  });
});
"
```

## 📈 Performance

- **Local MongoDB**: Handles 1000+ users easily
- **MongoDB Atlas**: Scales to millions of users
- **Memory Usage**: Minimal - only stores user metadata
- **Image Storage**: Zero database impact (temporary files only)

## 🎉 Benefits

✅ **Persistent Storage**: Data survives restarts  
✅ **Automatic Backups**: Regular backup creation  
✅ **Conflict Resolution**: Smart override handling  
✅ **Scalability**: Handles growth easily  
✅ **No Image Storage**: Database stays lean  
✅ **Statistics Tracking**: Claim counts and timestamps  
✅ **Easy Migration**: Simple JSON to MongoDB transfer  

---

**Ready to start?** Run `npm run setup-mongodb` to get started! 🚀
