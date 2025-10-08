const mongoose = require('mongoose');
const fs = require('fs');
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

async function deleteDuplicates() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Load the duplicates file
    const duplicatesData = JSON.parse(fs.readFileSync('duplicates-to-delete.json', 'utf8'));
    const recordIds = duplicatesData.recordIds;
    
    console.log(`📋 Loaded ${recordIds.length} duplicate record IDs to delete\n`);
    
    // Create backup before deletion
    const backupFilename = `backups/pre-dedup-backup-${new Date().toISOString()}.json`;
    console.log(`💾 Creating backup of all claims before deletion...`);
    const allClaims = await ClaimRecord.find({}).lean();
    fs.writeFileSync(backupFilename, JSON.stringify(allClaims, null, 2));
    console.log(`✅ Backup saved to ${backupFilename}\n`);
    
    // Get counts before deletion
    const totalBefore = await ClaimRecord.countDocuments({});
    const successBefore = await ClaimRecord.countDocuments({ status: 'success' });
    
    console.log(`📊 Before deletion:`);
    console.log(`   - Total claims: ${totalBefore}`);
    console.log(`   - Successful claims: ${successBefore}`);
    console.log(`\n🗑️  Deleting ${recordIds.length} duplicate records...\n`);
    
    // Delete in batches of 100 to avoid overwhelming the database
    const batchSize = 100;
    let deleted = 0;
    
    for (let i = 0; i < recordIds.length; i += batchSize) {
      const batch = recordIds.slice(i, i + batchSize);
      const result = await ClaimRecord.deleteMany({ _id: { $in: batch } });
      deleted += result.deletedCount;
      console.log(`   Deleted batch ${Math.floor(i / batchSize) + 1}: ${result.deletedCount} records (${deleted}/${recordIds.length} total)`);
    }
    
    // Get counts after deletion
    const totalAfter = await ClaimRecord.countDocuments({});
    const successAfter = await ClaimRecord.countDocuments({ status: 'success' });
    
    console.log(`\n✅ Deletion complete!`);
    console.log(`\n📊 After deletion:`);
    console.log(`   - Total claims: ${totalAfter}`);
    console.log(`   - Successful claims: ${successAfter}`);
    console.log(`\n📈 Changes:`);
    console.log(`   - Removed: ${deleted} duplicate records`);
    console.log(`   - Expected: ${recordIds.length}`);
    console.log(`   - Match: ${deleted === recordIds.length ? '✅ Yes' : '❌ No'}`);
    
    // Create deletion report
    const report = {
      deletionDate: new Date(),
      before: {
        total: totalBefore,
        successful: successBefore
      },
      after: {
        total: totalAfter,
        successful: successAfter
      },
      deleted: deleted,
      expected: recordIds.length,
      backupFile: backupFilename
    };
    
    const reportFilename = `reports/dedup-report-${new Date().toISOString()}.json`;
    fs.writeFileSync(reportFilename, JSON.stringify(report, null, 2));
    console.log(`\n📄 Deletion report saved to ${reportFilename}`);
    
    await mongoose.disconnect();
    console.log('\n✅ Done!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

deleteDuplicates();
