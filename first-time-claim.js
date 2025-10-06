/**
 * Advanced First-time claim script - Claims rewards for a single newly registered user
 * Usage: node first-time-claim.js <eightBallPoolId> <username>
 * 
 * Updated with sophisticated logic from playwright-claimer-discord.js:
 * - Advanced login detection and form filling
 * - Sophisticated button detection with multiple selectors
 * - Target keyword identification
 * - Parent text analysis for item identification
 * - Proper modal dismissal and overlay handling
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

async function performLogin(page, userId) {
  try {
    console.log('🔍 Looking for login modal...');
    
    // Look for potential login triggers by hovering
    const potentialTriggers = await page.locator('button, a, [role="button"], [class*="login"], [class*="signin"], [class*="enter"]').all();
    console.log(`Found ${potentialTriggers.length} potential login triggers`);
    
    // Try hovering over potential triggers first
    for (let i = 0; i < Math.min(potentialTriggers.length, 8); i++) {
      try {
        const trigger = potentialTriggers[i];
        console.log(`🖱️ Hovering over potential trigger ${i + 1}...`);
        await trigger.hover();
        await page.waitForTimeout(1000);
        
        // Check if login modal appeared
        const modal = await page.locator('input[type="text"], input[placeholder*="ID"], input[placeholder*="id"]').first();
        const modalVisible = await modal.isVisible().catch(() => false);
        
        if (modalVisible) {
          console.log('✅ Login modal appeared after hovering!');
          await fillLoginForm(page, userId);
          return;
        }
      } catch (error) {
        console.log(`⚠️ Error hovering over trigger ${i + 1}`);
      }
    }

    // Look for login buttons and click them
    const loginButtons = await page.locator('button').filter({ hasText: /login|sign.?in|enter/i }).all();
    console.log(`Found ${loginButtons.length} login buttons`);

    let loginModalAppeared = false;
    for (let i = 0; i < loginButtons.length; i++) {
      try {
        const button = loginButtons[i];
        console.log(`🖱️ Clicking login button ${i + 1}...`);
        await button.click();
        await page.waitForTimeout(2000);
        
        // Check if login modal appeared
        const modal = await page.locator('input[type="text"], input[placeholder*="ID"], input[placeholder*="id"]').first();
        const modalVisible = await modal.isVisible().catch(() => false);
        
        if (modalVisible) {
          console.log('✅ Login modal appeared after clicking!');
          loginModalAppeared = true;
          break;
        }
      } catch (error) {
        console.log(`⚠️ Error clicking login button ${i + 1}`);
      }
    }

    if (!loginModalAppeared) {
      console.log('⚠️ No login modal found, trying direct input search...');
    }

    // Fill login form
    console.log('📝 Filling login form...');
    await fillLoginForm(page, userId);

  } catch (error) {
    console.error('❌ Error during login process:', error.message);
  }
}

async function fillLoginForm(page, userId) {
  try {
    // Wait a bit for any modals to appear
    await page.waitForTimeout(1000);
    
    // Look for input field with more comprehensive selectors
    const inputSelectors = [
      'input[type="text"]',
      'input[type="number"]',
      'input[placeholder*="ID"]',
      'input[placeholder*="id"]',
      'input[placeholder*="User"]',
      'input[placeholder*="user"]',
      'input[name*="id"]',
      'input[name*="user"]',
      'input[class*="id"]',
      'input[class*="user"]',
      'input[class*="login"]',
      'input[class*="input"]',
      'input[data-testid*="id"]',
      'input[data-testid*="user"]',
      'input[data-testid*="login"]'
    ];

    let input = null;
    for (const selector of inputSelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          // Check if any of these elements are visible
          for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const isVisible = await element.isVisible().catch(() => false);
            if (isVisible) {
              input = element;
              console.log(`Found visible ${selector} input field at index ${i}`);
              break;
            }
          }
          if (input) break;
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    if (!input) {
      console.log('❌ No visible input field found');
      // Try to find any input in a modal or dialog
      const modalInputs = await page.locator('[role="dialog"] input, .modal input, .popup input, [class*="modal"] input').all();
      if (modalInputs.length > 0) {
        for (let i = 0; i < modalInputs.length; i++) {
          const element = modalInputs[i];
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            input = element;
            console.log(`Found input field in modal at index ${i}`);
            break;
          }
        }
      }
    }

    if (!input) {
      console.log('❌ No input field found anywhere');
      return;
    }

    // Focus and fill input
    console.log('🖱️ Hovering over input field...');
    await input.hover();
    console.log('🖱️ Clicking input field to focus...');
    await input.click();
    
    console.log('📝 Clearing and filling input...');
    await input.fill('');
    await input.fill(userId);
    console.log(`✅ Entered User ID: ${userId}`);

    // Take screenshot after entering ID
    await page.screenshot({ path: `screenshots/id-entry/after-id-entry-${userId}.png` });
    console.log(`📸 Screenshot after ID entry saved as after-id-entry-${userId}.png`);

    // Click Go button
    await clickGoButton(page, input);
    
    // Wait for login to complete and take another screenshot
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `screenshots/go-click/after-go-click-${userId}.png` });
    console.log(`📸 Screenshot after Go click saved as after-go-click-${userId}.png`);

  } catch (error) {
    console.error('❌ Error filling login form:', error.message);
  }
}

async function clickGoButton(page, input) {
  try {
    console.log('🔍 Looking for Go button by position and attributes...');
    
    let goButtonFound = false;

    // Method 1: Look for button that's immediately after the input field in the DOM
    try {
      const nextElement = await input.locator('xpath=following-sibling::*[1]').first();
      const nextElementTag = await nextElement.evaluate(el => el.tagName);
      const nextElementText = await nextElement.textContent();
      
      console.log(`Next element after input: ${nextElementTag}, text: "${nextElementText}"`);
      
      if (nextElementTag === 'BUTTON' && nextElementText.includes('Go')) {
        console.log('✅ Found Go button as immediate next sibling');
        await nextElement.click();
        console.log('✅ Clicked immediate next sibling Go button');
        goButtonFound = true;
      }
    } catch (error) {
      console.log('⚠️ Immediate next sibling not a Go button');
    }

    // Method 2: Look for button with specific styling that indicates it's the login button
    if (!goButtonFound) {
      try {
        const styledButtons = await page.locator('button[style*="background"], button[class*="primary"], button[class*="submit"], button[class*="login"]').all();
        
        for (let i = 0; i < styledButtons.length; i++) {
          const button = styledButtons[i];
          const buttonText = await button.textContent();
          const buttonClass = await button.getAttribute('class') || '';
          
          if (buttonText.includes('Go') && !buttonClass.includes('google')) {
            const isVisible = await button.isVisible();
            if (isVisible) {
              console.log(`✅ Found styled Go button: "${buttonText}"`);
              await button.click();
              console.log('✅ Clicked styled Go button');
              goButtonFound = true;
              break;
            }
          }
        }
      } catch (error) {
        console.log('⚠️ No styled Go button found');
      }
    }

    // Method 3: Look for button that's in a form with the input
    if (!goButtonFound) {
      try {
        const form = await input.locator('xpath=ancestor::form').first();
        const formButtons = await form.locator('button').all();
        
        for (let i = 0; i < formButtons.length; i++) {
          const button = formButtons[i];
          const buttonText = await button.textContent();
          
          if (buttonText.includes('Go')) {
            const isVisible = await button.isVisible();
            if (isVisible) {
              console.log(`✅ Found Go button in form: "${buttonText}"`);
              await button.click();
              console.log('✅ Clicked form Go button');
              goButtonFound = true;
              break;
            }
          }
        }
      } catch (error) {
        console.log('⚠️ No form Go button found');
      }
    }

    if (!goButtonFound) {
      console.log('❌ No suitable Go button found');
    }

    // Wait for login to complete and check for redirects
    await page.waitForTimeout(3000);
    
    // Check if we got redirected to Google or another site
    const currentUrl = page.url();
    console.log(`🌐 Current URL after login attempt: ${currentUrl}`);
    
    if (currentUrl.includes('google.com') || currentUrl.includes('accounts.google.com')) {
      console.log('⚠️ Redirected to Google - this might indicate a login issue');
    } else if (currentUrl.includes('8ballpool.com')) {
      console.log('✅ Still on 8ball pool site - login may have succeeded');
    } else {
      console.log(`⚠️ Unexpected redirect to: ${currentUrl}`);
    }

  } catch (error) {
    console.error('❌ Error clicking Go button:', error.message);
  }
}

async function claimFreeItems(page, userId) {
  try {
    const claimedItems = [];
    
    console.log('🎁 Looking for all FREE and CLAIM buttons...');
    
    // Specific target keywords to identify rewards we care about
    // ORDER MATTERS! Check more specific items first
    const targetKeywords = [
      // Free Daily Cue Piece FIRST (most specific - check before individual cue names)
      'Free Daily Cue Piece', 'FREE DAILY CUE PIECE', 'DAILY CUE PIECE', 'Daily Cue Piece',
      'Free Cue Piece', 'FREE CUE PIECE',
      // Black Diamond (special item)
      'Black Diamond', 'BLACK DIAMOND',
      // Daily Rewards
      'Daily Reward', 'DAILY REWARD', 'WEBSHOP EXCLUSIVE',
      // 7 Random Cues (check AFTER Free Daily Cue Piece)
      'Opti Shot', 'Spin Wizard', 'Power Break', 'Strike Zone', 
      'Trickster', 'Gamechanger', 'Legacy Strike',
      // Other items
      'Cash', 'Coins', 'Box', 'Boxes', 'FREE CASH', 'FREE COINS'
    ];
    
    // Find all FREE/CLAIM buttons first
    console.log('🔍 Scanning for all FREE and CLAIM buttons...');
    const freeButtonSelectors = [
      'button:has-text("FREE")',
      'button:has-text("free")',
      'a:has-text("FREE")',
      'a:has-text("free")',
      '[class*="free"]:has-text("FREE")',
      '[class*="free"]:has-text("free")'
    ];

    let allFreeButtons = [];
    for (const selector of freeButtonSelectors) {
      try {
        const buttons = await page.locator(selector).all();
        allFreeButtons = allFreeButtons.concat(buttons);
      } catch (error) {
        // Continue with next selector
      }
    }

    // Remove duplicates
    const uniqueButtons = [];
    for (const button of allFreeButtons) {
      try {
        const isVisible = await button.isVisible();
        if (isVisible) {
          const buttonText = await button.textContent();
          const buttonId = await button.evaluate(el => el.id || el.className || el.textContent);
          
          // Check if we already have this button
          const alreadyExists = uniqueButtons.some(existing => {
            return existing.id === buttonId;
          });
          
          if (!alreadyExists) {
            uniqueButtons.push({
              element: button,
              text: buttonText,
              id: buttonId
            });
          }
        }
      } catch (error) {
        // Skip this button
      }
    }

    console.log(`Found ${uniqueButtons.length} unique FREE buttons`);

    if (uniqueButtons.length === 0) {
      console.log('❌ No FREE buttons found - may already be claimed or not available');
      
      // Count total buttons for debugging
      const allButtons = await page.locator('button').all();
      console.log(`Found ${allButtons.length} total buttons on page`);
      return claimedItems;
    }

    // Click each FREE button (after checking if it's claimable)
    for (let i = 0; i < uniqueButtons.length; i++) {
      const buttonInfo = uniqueButtons[i];
      try {
        // Check if button should be clicked (for actual claiming)
        const shouldClick = await shouldClickButton(buttonInfo.element, buttonInfo.text, console);
        if (!shouldClick) {
          continue;
        }
        
        // Check if button should be skipped for counting (already claimed indicators)
        const shouldSkipForCounting = shouldSkipButtonForCounting(buttonInfo.text, console);
        
        // Check if button is disabled
        const isDisabled = await buttonInfo.element.isDisabled().catch(() => false);
        if (isDisabled) {
          console.log(`⏭️ Skipping button ${i + 1} - disabled/greyed out`);
          continue;
        }
        
        // Check if button is actually clickable
        const isClickable = await buttonInfo.element.evaluate(el => !el.disabled && el.offsetParent !== null).catch(() => false);
        if (!isClickable) {
          console.log(`⏭️ Skipping button ${i + 1} - not clickable`);
          continue;
        }
        
        // Try to identify what item this button is for
        let itemName = 'Unknown Item';
        try {
          // Look for text in multiple parent levels
          let parentText = '';
          
          // Try to get text from several ancestor levels
          for (let level = 1; level <= 5; level++) {
            try {
              const parent = await buttonInfo.element.locator(`xpath=ancestor::div[${level}]`).first();
              const text = await parent.textContent().catch(() => '');
              parentText += ' ' + text;
            } catch (e) {
              // Continue with next level
            }
          }
          
          console.log(`📝 Parent text snippet: ${parentText.substring(0, 200)}...`);
          
          // Check if it matches any of our target keywords
          for (const keyword of targetKeywords) {
            if (parentText.includes(keyword)) {
              itemName = keyword;
              console.log(`🎯 Identified item: ${keyword}`);
              break;
            }
          }
        } catch (error) {
          // Use button text if we can't find parent
          itemName = buttonInfo.text || 'Unknown';
        }
        
        console.log(`🎁 Clicking FREE button ${i + 1} for "${itemName}" (button text: "${buttonInfo.text}")`);
        
        // Scroll button into view
        await buttonInfo.element.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        
        // Force-hide interfering overlays using JavaScript
        try {
          await page.evaluate(() => {
            // Hide all consent overlays and sidebars that might interfere
            const selectors = [
              '[class*="mc-consents"]',
              '[class*="mc-sidebar"]', 
              '[class*="consent"]',
              '[class*="cookie"]',
              '[class*="policy"]',
              '[role="dialog"]',
              '[class*="modal"]',
              '[class*="popup"]'
            ];
            
            selectors.forEach(selector => {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => {
                if (el) {
                  el.style.display = 'none';
                  el.style.visibility = 'hidden';
                  el.style.opacity = '0';
                  el.style.pointerEvents = 'none';
                }
              });
            });
            
            console.log('🔧 Force-hid all interfering overlays');
          });
          
          // Wait for any animations to complete
          await page.waitForTimeout(1000);
        } catch (error) {
          console.log('⚠️ Could not force-hide overlays, continuing...');
        }
        
        // Store original button text for validation
        const originalButtonText = await buttonInfo.element.evaluate(el => el.textContent || '');
        buttonInfo.element._originalText = originalButtonText;
        
        // Bypass Privacy Settings modal by force-clicking FREE buttons directly
        try {
          // Check if Privacy Settings modal is present
          const privacyModal = await page.$('text="Privacy Settings"');
          if (privacyModal) {
            console.log('🍪 Privacy Settings modal detected - using force-click bypass');
            
            // Try to dismiss Privacy Settings modal by clicking outside or using aggressive dismissal
            console.log('🍪 Privacy Settings modal detected - attempting aggressive dismissal');
            
            // Try multiple dismissal strategies
            const dismissalSuccess = await page.evaluate(() => {
              try {
                // Strategy 1: Click outside the modal (on backdrop)
                const modal = document.querySelector('[class*="modal"], [role="dialog"]');
                if (modal) {
                  const backdrop = modal.parentElement;
                  if (backdrop && backdrop !== modal) {
                    backdrop.click();
                    return true;
                  }
                }
                
                // Strategy 2: Press Escape key
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
                return true;
                
                // Strategy 3: Try to find and click any close button
                const closeButtons = document.querySelectorAll('button, [role="button"]');
                for (const btn of closeButtons) {
                  const text = btn.textContent || '';
                  if (text.toLowerCase().includes('save') || 
                      text.toLowerCase().includes('exit') || 
                      text.toLowerCase().includes('close') ||
                      text.toLowerCase().includes('dismiss')) {
                    btn.click();
                    return true;
                  }
                }
                
                return false;
              } catch (error) {
                return false;
              }
            });
            
            if (dismissalSuccess) {
              console.log('✅ Modal dismissal successful');
              await page.waitForTimeout(2000);
              // Now try normal click
              await buttonInfo.element.click();
            } else {
              console.log('⚠️ Modal dismissal failed, trying force click');
              // Fallback to force click
              try {
                await buttonInfo.element.click({ force: true });
                console.log('✅ Force click successful');
              } catch (forceError) {
                console.log(`⚠️ Force click failed: ${forceError.message}`);
              }
            }
          } else {
            // No modal detected, proceed with normal click
            await buttonInfo.element.click();
          }
        } catch (error) {
          console.log(`⚠️ Error with modal bypass: ${error.message}`);
          // Fallback to normal click
          try {
            await buttonInfo.element.click();
          } catch (clickError) {
            console.log(`⚠️ Normal click failed: ${clickError.message}`);
          }
        }
        
        // Use standardized claim validation logic
        const isValidNewClaim = await validateClaimResult(buttonInfo.element, itemName, console);
        
        // Only count if it wasn't already skipped for counting AND it's a valid new claim
        if (!shouldSkipForCounting && isValidNewClaim) {
          claimedItems.push(itemName);
        }
      
        // Wait between clicks
        await page.waitForTimeout(2000);
        
      } catch (error) {
        console.log(`⚠️ Error clicking FREE button ${i + 1}: ${error.message}`);
      }
    }

    console.log(`🎉 Claimed ${claimedItems.length} items: ${claimedItems.join(', ')}`);
    return claimedItems;

  } catch (error) {
    console.error('❌ Error claiming free items:', error.message);
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node first-time-claim.js <eightBallPoolId> <username>');
    process.exit(1);
  }

  const eightBallPoolId = args[0];
  const username = args[1];

  console.log(`🎁 Starting ADVANCED FIRST-TIME claim for: ${username} (${eightBallPoolId})`);

  let browser;
  let page;
  let screenshotPath;

  try {
    // Ensure screenshot directories exist
    await ensureScreenshotDirectories();

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Launch browser
    console.log('🌐 Launching browser...');
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    page = await browser.newPage();

    // Set proper User-Agent to avoid 403 Forbidden
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    // Navigate to Daily Reward section
    console.log('🌐 Navigating to Daily Reward section...');
    await page.goto('https://8ballpool.com/en/shop#daily_reward', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    console.log('✅ Successfully loaded Daily Reward page');

    // Take initial screenshot
    await page.screenshot({ path: `screenshots/shop-page/shop-page-${eightBallPoolId}.png` });
    console.log('📸 Initial screenshot saved');

    // Perform login
    await performLogin(page, eightBallPoolId);

    // Take screenshot after login
    await page.screenshot({ path: `screenshots/login/after-login-${eightBallPoolId}.png` });
    console.log('📸 Screenshot after login saved');

    // Claim items from Daily Reward section
    console.log('🎁 Checking Daily Reward section for FREE items...');
    let claimedItems = await claimFreeItems(page, eightBallPoolId);
    console.log(`✅ Claimed ${claimedItems.length} items from Daily Reward section`);

    // Navigate to Free Daily Cue Piece section
    console.log('🌐 Navigating to Free Daily Cue Piece section...');
    await page.goto('https://8ballpool.com/en/shop#free_daily_cue_piece', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    console.log('✅ Successfully loaded Free Daily Cue Piece page');

    // Wait for page to settle
    await page.waitForTimeout(2000);

    // Claim items from Free Daily Cue Piece section
    console.log('🎁 Checking Free Daily Cue Piece section for FREE items...');
    let cueItems = await claimFreeItems(page, eightBallPoolId);
    claimedItems = claimedItems.concat(cueItems);
    console.log(`✅ Claimed ${cueItems.length} items from Free Daily Cue Piece section`);

    // Take final screenshot
    screenshotPath = `screenshots/final-page/final-page-${eightBallPoolId}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Final screenshot saved as ${screenshotPath}`);

    // Save claim record to database
    const claimRecord = new ClaimRecord({
      eightBallPoolId: eightBallPoolId,
      websiteUserId: username,
      status: 'success',
      itemsClaimed: claimedItems.length > 0 ? claimedItems : ['First time claim completed'],
      claimedAt: new Date()
    });

    await claimRecord.save();
    console.log('💾 Claim record saved to database');

    console.log('🎉 First-time claim COMPLETE for', username, '!');
    console.log(`✅ Total claimed: ${claimedItems.length} items`);
    console.log(`📋 Items: ${claimedItems.join(', ')}`);

  } catch (error) {
    console.error('❌ Error during first-time claim:', error.message);
    
    // Save failed claim record
    try {
      const claimRecord = new ClaimRecord({
        eightBallPoolId: eightBallPoolId,
        websiteUserId: username,
        status: 'failed',
        error: error.message,
        claimedAt: new Date()
      });
      await claimRecord.save();
      console.log('💾 Failed claim record saved to database');
    } catch (dbError) {
      console.error('❌ Error saving failed claim record:', dbError.message);
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
}

// Run the script
main().catch(console.error);