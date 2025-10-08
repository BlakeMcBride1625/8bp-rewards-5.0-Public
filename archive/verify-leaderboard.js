const mongoose = require('mongoose');
require('dotenv').config();

// ClaimRecord schema
const ClaimRecordSchema = new mongoose.Schema({
  eightBallPoolId: { type: String, required: true, index: true },
  websiteUserId: { type: String, required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  itemsClaimed: [String],
  error: String,
  claimedAt: { type: Date, default: Date.now },
  schedulerRun: Date
}, { timestamps: true, collection: 'claim_records' });

const ClaimRecord = mongoose.model('ClaimRecord', ClaimRecordSchema);

async function verifyLeaderboard() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('📊 Checking for any remaining duplicates...\n');
    
    const duplicates = await ClaimRecord.aggregate([
      {
        $match: {
          status: 'success'
        }
      },
      {
        $group: {
          _id: {
            userId: '$eightBallPoolId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$claimedAt' } }
          },
          count: { $sum: 1 },
          claims: { $push: { _id: '$_id', claimedAt: '$claimedAt' } }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    if (duplicates.length > 0) {
      console.log(`❌ Found ${duplicates.length} user-days still with duplicates!`);
      duplicates.forEach(dup => {
        console.log(`   - User ${dup._id.userId} on ${dup._id.date}: ${dup.count} claims`);
      });
    } else {
      console.log(`✅ No duplicates found! Each user has max 1 claim per day.`);
    }
    
    console.log(`\n📊 Leaderboard Summary (Last 7 days):\n`);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const leaderboard = await ClaimRecord.aggregate([
      {
        $match: {
          claimedAt: { $gte: startDate },
          status: 'success'
        }
      },
      {
        $group: {
          _id: {
            userId: '$eightBallPoolId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$claimedAt' } }
          },
          itemsClaimed: { $first: '$itemsClaimed' }
        }
      },
      {
        $group: {
          _id: '$_id.userId',
          totalClaims: { $sum: 1 },
          totalItemsClaimed: { $sum: { $size: '$itemsClaimed' } }
        }
      },
      {
        $sort: { totalItemsClaimed: -1 }
      },
      {
        $limit: 10
      }
    ]);

    leaderboard.forEach((entry, index) => {
      console.log(`   ${index + 1}. User ${entry._id}: ${entry.totalClaims} days claimed, ${entry.totalItemsClaimed} items total`);
    });

    console.log(`\n✅ Leaderboard is clean! Each number represents unique days, not duplicate claims.`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

verifyLeaderboard();
