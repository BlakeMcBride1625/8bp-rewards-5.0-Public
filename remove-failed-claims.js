#!/usr/bin/env node

/**
 * Remove Failed Claims Script
 * 
 * This script removes all failed claim records from the MongoDB database.
 * Failed claims are identified by status: 'failed' in the claim_records collection.
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
async function connectToDatabase() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    return false;
  }
}

// Remove failed claims
async function removeFailedClaims() {
  try {
    const db = mongoose.connection.db;
    const claimRecordsCollection = db.collection('claim_records');

    // First, count how many failed claims exist
    console.log('📊 Checking for failed claims...');
    const failedClaimsCount = await claimRecordsCollection.countDocuments({ status: 'failed' });
    
    if (failedClaimsCount === 0) {
      console.log('✅ No failed claims found in the database');
      return;
    }

    console.log(`📊 Found ${failedClaimsCount} failed claims to remove`);

    // Get some sample failed claims for review
    const sampleFailedClaims = await claimRecordsCollection
      .find({ status: 'failed' })
      .limit(5)
      .toArray();

    console.log('\n📋 Sample failed claims to be removed:');
    sampleFailedClaims.forEach((claim, index) => {
      console.log(`${index + 1}. User: ${claim.eightBallPoolId}, Error: ${claim.error || 'No error message'}, Date: ${claim.claimedAt}`);
    });

    // Confirm deletion
    console.log(`\n⚠️  About to delete ${failedClaimsCount} failed claim records`);
    console.log('This action cannot be undone!');
    
    // In a real script, you might want to add a confirmation prompt
    // For now, we'll proceed with the deletion
    
    // Delete all failed claims
    console.log('\n🗑️  Removing failed claims...');
    const deleteResult = await claimRecordsCollection.deleteMany({ status: 'failed' });
    
    console.log(`✅ Successfully removed ${deleteResult.deletedCount} failed claim records`);

    // Verify deletion
    const remainingFailedCount = await claimRecordsCollection.countDocuments({ status: 'failed' });
    console.log(`📊 Remaining failed claims: ${remainingFailedCount}`);

    // Show updated statistics
    const totalClaims = await claimRecordsCollection.countDocuments({});
    const successfulClaims = await claimRecordsCollection.countDocuments({ status: 'success' });
    
    console.log('\n📈 Updated database statistics:');
    console.log(`   Total claims: ${totalClaims}`);
    console.log(`   Successful claims: ${successfulClaims}`);
    console.log(`   Failed claims: ${remainingFailedCount}`);

  } catch (error) {
    console.error('❌ Error removing failed claims:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting Failed Claims Removal Script');
    console.log('=====================================\n');

    // Connect to database
    const connected = await connectToDatabase();
    if (!connected) {
      process.exit(1);
    }

    // Remove failed claims
    await removeFailedClaims();

    console.log('\n✅ Script completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  } finally {
    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { removeFailedClaims, connectToDatabase };




