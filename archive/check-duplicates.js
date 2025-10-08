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

async function checkDuplicates() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all duplicate claims (same user, same day, successful)
    console.log('🔍 Searching for duplicate claims (same user, same day)...\n');
    
    const duplicates = await ClaimRecord.aggregate([
      {
        $match: {
          status: 'success'
        }
      },
      {
        // Group by user and date
        $group: {
          _id: {
            userId: '$eightBallPoolId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$claimedAt' } }
          },
          count: { $sum: 1 },
          claims: { $push: { _id: '$_id', claimedAt: '$claimedAt', itemsClaimed: '$itemsClaimed' } }
        }
      },
      {
        // Only show where count > 1 (duplicates)
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { '_id.date': -1 }
      }
    ]);

    console.log(`📊 Found ${duplicates.length} user-days with duplicate claims\n`);
    
    let totalDuplicateRecords = 0;
    let recordsToDelete = [];

    for (const dup of duplicates) {
      const userId = dup._id.userId;
      const date = dup._id.date;
      const count = dup.count;
      
      console.log(`👤 User ${userId} on ${date}:`);
      console.log(`   - Total claims: ${count}`);
      console.log(`   - Duplicate claims: ${count - 1}`);
      
      // Sort by claimedAt, keep the first one, mark others for deletion
      const sortedClaims = dup.claims.sort((a, b) => new Date(a.claimedAt) - new Date(b.claimedAt));
      
      console.log(`   - Keeping first claim: ${sortedClaims[0].claimedAt}`);
      
      // Mark all except the first for deletion
      for (let i = 1; i < sortedClaims.length; i++) {
        console.log(`   - Marking for deletion: ${sortedClaims[i].claimedAt}`);
        recordsToDelete.push(sortedClaims[i]._id);
        totalDuplicateRecords++;
      }
      console.log('');
    }

    console.log(`\n📊 Summary:`);
    console.log(`   - User-days with duplicates: ${duplicates.length}`);
    console.log(`   - Total duplicate records to remove: ${totalDuplicateRecords}`);
    
    if (totalDuplicateRecords > 0) {
      console.log(`\n💾 Saving list of duplicates to delete...`);
      
      // Save the IDs to a file for the deletion script
      const fs = require('fs');
      fs.writeFileSync('duplicates-to-delete.json', JSON.stringify({
        totalDuplicates: totalDuplicateRecords,
        recordIds: recordsToDelete
      }, null, 2));
      
      console.log(`✅ Saved ${totalDuplicateRecords} duplicate IDs to duplicates-to-delete.json`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkDuplicates();
