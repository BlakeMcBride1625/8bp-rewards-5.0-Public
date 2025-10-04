/**
 * First-time claim script - Claims rewards for a single newly registered user
 * Usage: node first-time-claim.js <eightBallPoolId> <username>
 * 
 * Updated with modern improvements:
 * - Dual navigation (daily rewards + cue pieces)
 * - Already-claimed detection
 * - Organized screenshots
 * - Advanced button detection
 * - Comprehensive error handling
 */

const { chromium } = require('playwright');
const { validateClaimResult, shouldSkipButtonForCounting, shouldClickButton } = require('./claimer-utils');
const mongoose = require('mongoose');
require('dotenv').config();

// ClaimRecord schema (matching backend TypeScript model)
const ClaimRecordSchema = new mongoose.Schema({
  eightBallPoolId: { type: String, required: true, index: true },
  websiteUserId: { type: String, required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  itemsClaimed: [String],
  error: String,
  claimedAt: { type: Date, default: Date.now },
  schedulerRun: Date
}, { timestamps: true, collection: 'claim_records' });

const ClaimRecord = mongoose.models.ClaimRecord || mongoose.model('ClaimRecord', ClaimRecordSchema);

async function ensureScreenshotDirectories() {
  try {
    const fs = require('fs');
    const path = require('path');

    const directories = [
      'screenshots',
      'screenshots/shop-page',
      'screenshots/login',
      'screenshots/id-entry',
      'screenshots/go-click',
      'screenshots/final-page'
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    }
  } catch (error) {
    console.error('❌ Error creating screenshot directories:', error.message);
  }
}

async function claimFreeItems(page, userId) {
  console.log('🎁 Looking for FREE rewards...');
  const freeButtons = await page.$$('button:has-text("FREE")');
  const claimableButtons = [];
  
  // Filter out already-claimed and disabled buttons
  for (const button of freeButtons) {
    if (await button.isVisible()) {
      try {
        const buttonText = await button.textContent();
        
        // Skip if button says "CLAIMED" (case insensitive)
        if (buttonText && buttonText.toLowerCase().includes('claimed')) {
          console.log(`⏭️ Skipping button - already CLAIMED: "${buttonText}"`);
          continue;
        }
        
        // Also check if button contains other "already claimed" indicators
        if (buttonText && (
          buttonText.toLowerCase().includes('already') ||
          buttonText.includes('✓') ||
          buttonText.toLowerCase().includes('collected')
        )) {
          console.log(`⏭️ Skipping button - already claimed indicator: "${buttonText}"`);
          continue;
        }
        
        // Check if button is disabled
        const isDisabled = await button.isDisabled().catch(() => false);
        if (isDisabled) {
          console.log(`⏭️ Skipping button - disabled/greyed out`);
          continue;
        }
        
        // Check if button is actually clickable
        const isClickable = await button.isEnabled().catch(() => false);
        if (!isClickable) {
          console.log(`⏭️ Skipping button - not clickable`);
          continue;
        }
        
        claimableButtons.push(button);
      } catch (error) {
        console.log(`⚠️ Error checking button: ${error.message}`);
        continue;
      }
    }
  }
  
  console.log(`🎯 Found ${claimableButtons.length} claimable FREE rewards`);
  
  const claimedItems = [];
  for (let i = 0; i < claimableButtons.length; i++) {
    try {
      const button = claimableButtons[i];
      const buttonText = await button.textContent();
      
      // Try to identify what item this button is for
      let itemName = 'Unknown Item';
      try {
        // Look for text in multiple parent levels
        const parentElement = await button.evaluateHandle(el => 
          el.closest('[class*="daily"], [class*="reward"], [class*="cue"], [class*="piece"], [class*="card"]') || 
          el.closest('div')
        );
        if (parentElement) {
          const parentText = await parentElement.evaluate(el => el.textContent || '');
          if (parentText) {
            // Extract a more specific item name from the parent text
            const match = parentText.match(/(Daily Reward|Free Daily Cue Piece|[\w\s]+?)\s*(?:CLAIMED|FREE|Free|free|Get|get)/i);
            if (match && match[1]) {
              itemName = match[1].trim();
            } else {
              itemName = parentText.substring(0, 50).trim() + '...';
            }
          }
        }
      } catch (error) {
        itemName = buttonText || 'Unknown';
      }
      
      console.log(`🎁 Clicking FREE button ${i + 1} for "${itemName}"`);
      
      // Scroll button into view
      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      
        // Check if button should be clicked (for actual claiming)
        const shouldClick = await shouldClickButton(button, buttonText, console);
        if (!shouldClick) {
          continue;
        }
        
        // Check if button should be skipped for counting (already claimed indicators)
        const shouldSkipForCounting = shouldSkipButtonForCounting(buttonText, console);
        
        // Click the button
        await button.click();
        
        // Use standardized claim validation logic
        const isValidNewClaim = await validateClaimResult(button, itemName, console);
        
        // Only count if it wasn't already skipped for counting AND it's a valid new claim
        if (!shouldSkipForCounting && isValidNewClaim) {
          claimedItems.push(itemName);
        }
      
      // Wait between clicks
      await page.waitForTimeout(2000);
      
    } catch (error) {
      console.log(`❌ Failed to click FREE button ${i + 1}: ${error.message}`);
      // Continue to next button
    }
  }
  
  return claimedItems;
}

async function claimForSingleUser(eightBallPoolId, username) {
  console.log(`🎁 Starting FIRST-TIME claim for: ${username} (${eightBallPoolId})`);
  
  // Ensure screenshot directories exist
  await ensureScreenshotDirectories();
  
  const dailyRewardUrl = 'https://8ballpool.com/en/shop#daily_reward';
  const freeDailyCueUrl = 'https://8ballpool.com/en/shop#free_daily_cue_piece';
  let browser;
  
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    console.log('🌐 Launching browser...');
    browser = await chromium.launch({ 
      headless: process.env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    
    // Navigate to Daily Reward section first
    console.log('🌐 Navigating to Daily Reward section...');
    await page.goto(dailyRewardUrl, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('✅ Successfully loaded Daily Reward page');
    
    // Take initial screenshot
    await page.screenshot({ path: `screenshots/shop-page/first-time-shop-page-${eightBallPoolId}.png` });
    console.log('📸 Initial screenshot saved');
    
    // Click login button
    console.log('🔓 Opening login modal...');
    const loginButtons = await page.$$('button:has-text("GUEST LOGIN")');
    if (loginButtons.length > 0) {
      await loginButtons[0].click();
      await page.waitForTimeout(2000);
    }
    
    // Enter user ID
    console.log(`📝 Logging in as ${eightBallPoolId}...`);
    const inputFields = await page.$$('input[placeholder*="Unique ID"]');
    if (inputFields.length > 0) {
      await inputFields[0].click();
      await inputFields[0].fill(eightBallPoolId);
      
      // Take screenshot after entering ID
      await page.screenshot({ path: `screenshots/id-entry/first-time-id-entry-${eightBallPoolId}.png` });
      console.log('📸 Screenshot after ID entry saved');
      
      await page.waitForTimeout(1000);
    }
    
    // Click Go button
    const goButtons = await page.$$('button:has-text("Go")');
    if (goButtons.length > 0) {
      await goButtons[0].click();
      await page.waitForTimeout(3000);
      
      // Take screenshot after clicking Go
      await page.screenshot({ path: `screenshots/go-click/first-time-go-click-${eightBallPoolId}.png` });
      console.log('📸 Screenshot after Go click saved');
    }
    
    // Wait for login to complete
    await page.waitForTimeout(3000);
    
    // Take screenshot after login
    await page.screenshot({ path: `screenshots/login/first-time-after-login-${eightBallPoolId}.png` });
    console.log('📸 Screenshot after login saved');
    
    // Claim items from Daily Reward section
    console.log('🎁 Checking Daily Reward section for FREE items...');
    let claimedItems = await claimFreeItems(page, eightBallPoolId);
    console.log(`✅ Claimed ${claimedItems.length} items from Daily Reward section`);
    
    // Navigate to Free Daily Cue Piece section
    console.log('🌐 Navigating to Free Daily Cue Piece section...');
    await page.goto(freeDailyCueUrl, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('✅ Successfully loaded Free Daily Cue Piece page');
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Claim items from Free Daily Cue Piece section
    console.log('🎁 Checking Free Daily Cue Piece section for FREE items...');
    let cueItems = await claimFreeItems(page, eightBallPoolId);
    claimedItems = claimedItems.concat(cueItems);
    console.log(`✅ Claimed ${cueItems.length} items from Free Daily Cue Piece section`);
    
    // Take final screenshot
    await page.screenshot({ path: `screenshots/final-page/first-time-final-page-${eightBallPoolId}.png` });
    console.log('📸 Final screenshot saved');
    
    // Save claim record
    const claimRecord = new ClaimRecord({
      eightBallPoolId: eightBallPoolId,
      websiteUserId: username,
      status: 'success',
      itemsClaimed: claimedItems.length > 0 ? claimedItems : ['First time claim completed'],
      schedulerRun: new Date(),
      claimedAt: new Date()
    });
    
    await claimRecord.save();
    console.log('💾 Claim record saved to database');
    
    console.log(`🎉 First-time claim COMPLETE for ${username}!`);
    console.log(`✅ Total claimed: ${claimedItems.length} items`);
    console.log(`📋 Items: ${claimedItems.join(', ')}`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during first-time claim:', error.message);
    
    // Save failed claim record
    try {
      const claimRecord = new ClaimRecord({
        eightBallPoolId: eightBallPoolId,
        websiteUserId: username,
        status: 'failed',
        itemsClaimed: [],
        error: error.message,
        schedulerRun: new Date(),
        claimedAt: new Date()
      });
      await claimRecord.save();
    } catch (dbError) {
      console.error('❌ Failed to save error record:', dbError.message);
    }
    
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
    await mongoose.disconnect();
  }
}

// Main execution
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('❌ Usage: node first-time-claim.js <eightBallPoolId> <username>');
  console.error('   Example: node first-time-claim.js 1234567890 john_doe');
  process.exit(1);
}

const [eightBallPoolId, username] = args;
claimForSingleUser(eightBallPoolId, username);