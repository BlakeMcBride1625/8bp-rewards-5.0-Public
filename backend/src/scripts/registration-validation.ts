import { chromium, Page } from 'playwright';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables - try multiple possible .env locations
const possibleEnvPaths = [
  path.join(__dirname, '../../../.env'),
  path.join(__dirname, '../../../../.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../.env'),
  '.env'
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  try {
    dotenv.config({ path: envPath });
    // Verify it loaded by checking if a known env var exists
    if (process.env.POSTGRES_DB || process.env.DISCORD_TOKEN) {
      envLoaded = true;
      break;
    }
  } catch (e) {
    // Continue to next path
  }
}

// Fallback to default dotenv behavior
if (!envLoaded) {
  dotenv.config();
}

// Load database service - try multiple possible locations
let DatabaseService;
try {
  DatabaseService = require('../../../services/database-service');
} catch (e) {
  try {
    DatabaseService = require('../../../../services/database-service');
  } catch (e2) {
    try {
      DatabaseService = require(path.join(process.cwd(), 'services/database-service'));
    } catch (e3) {
      throw new Error('Could not load database-service. Tried: ../../../services/database-service, ../../../../services/database-service, and process.cwd()/services/database-service');
    }
  }
}

const dbService = DatabaseService.getInstance();

// Debug metrics
let validationMetrics = {
  totalUsers: 0,
  validUsers: 0,
  invalidUsers: 0,
  errors: 0,
  startTime: Date.now()
};

async function takeScreenshot(page: Page, filename: string, description: string): Promise<void> {
  try {
    await page.screenshot({ path: filename });
    console.log(`📸 ${description}: ${filename}`);
  } catch (error) {
    console.warn(`⚠️ Screenshot failed: ${error.message}`);
  }
}

async function deregisterUser(eightBallPoolId: string, reason: string, errorMessage?: string): Promise<void> {
  try {
    console.log(`🗑️ [DEREGISTRATION] Removing invalid user from database...`);
    
    // Remove from registrations table
    await dbService.removeUserByEightBallPoolId(eightBallPoolId);
    
    // Create invalid user record
    await dbService.createInvalidUserRecord({
      eightBallPoolId: eightBallPoolId,
      reason: reason,
      errorMessage: errorMessage || 'User validation failed',
      createdAt: new Date()
    });
    
    console.log(`✅ [DEREGISTRATION] Successfully deregistered user ${eightBallPoolId}`);
  } catch (error: any) {
    console.error(`❌ [DEREGISTRATION] Failed to deregister user ${eightBallPoolId}: ${error.message}`);
  }
}

async function triggerFirstTimeClaim(eightBallPoolId: string, username: string): Promise<void> {
  try {
    console.log(`🚀 [STAGE_2] Triggering first-time claim for validated user...`);
    console.log(`🚀 [STAGE_2] Starting first-time claim for validated user: ${username} (${eightBallPoolId})`);
    
    const { spawn } = require('child_process');
    
    // Resolve first-time-claim.js path - try multiple locations
    const possibleClaimScriptPaths = [
      path.join(__dirname, '../../../first-time-claim.js'),
      path.join(__dirname, '../../../../first-time-claim.js'),
      path.join(process.cwd(), 'first-time-claim.js'),
      path.join(process.cwd(), '../first-time-claim.js')
    ];
    
    let claimScript: string | null = null;
    const fs = require('fs');
    for (const scriptPath of possibleClaimScriptPaths) {
      try {
        if (fs.existsSync(scriptPath)) {
          claimScript = scriptPath;
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }
    
    if (!claimScript) {
      console.error(`❌ [STAGE_2] Could not find first-time-claim.js. Tried: ${possibleClaimScriptPaths.join(', ')}`);
      return;
    }
    
    console.log(`🚀 [STAGE_2] Running first-time claim script: ${claimScript}`);
    
    const claimProcess = spawn('node', [claimScript, eightBallPoolId, username], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
      detached: false
    });
    
    // Set a timeout for the claim process
    const timeout = setTimeout(() => {
      console.log(`⚠️ [STAGE_2] Claim process timeout - killing process`);
      claimProcess.kill('SIGKILL');
    }, 300000); // 5 minutes timeout
    
    let stdout = '';
    let stderr = '';
    
    claimProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      // Log important progress
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        if (line.includes('✅') || line.includes('❌') || line.includes('🎁') || line.includes('📋')) {
          console.log(`📋 [STAGE_2] ${line.trim()}`);
        }
      });
    });
    
    claimProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      console.warn(`⚠️ [STAGE_2] Claim stderr: ${data.toString().trim()}`);
    });
    
    claimProcess.on('close', (code: number | null) => {
      clearTimeout(timeout);
      if (code === 0) {
        console.log(`✅ [STAGE_2] First-time claim completed successfully for ${username} (${eightBallPoolId})`);
      } else {
        console.log(`❌ [STAGE_2] First-time claim failed for ${username} (${eightBallPoolId}) - Exit code: ${code}`);
      }
    });
    
    claimProcess.on('error', (error: Error) => {
      clearTimeout(timeout);
      console.error(`❌ [STAGE_2] Claim process error: ${error.message}`);
    });
    
  } catch (error: any) {
    console.error(`❌ [STAGE_2] Failed to trigger first-time claim: ${error.message}`);
  }
}

async function validateUserRegistration(eightBallPoolId: string, username: string): Promise<void> {
  console.log(`🎯 [VALIDATION] Starting registration validation for: ${username} (${eightBallPoolId})`);
  console.log(`📋 [VALIDATION] This is Stage 1: User Validation Only`);
  
  validationMetrics.totalUsers++;

  let browser: any = null;
  let page: Page | null = null;

  try {
    // Connect to database
    console.log(`🔗 Connecting to PostgreSQL...`);
    await dbService.connect();
    console.log(`✅ [VALIDATION] Connected to database`);

    // Launch browser
    console.log(`🌐 [VALIDATION] Launching validation browser...`);
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    page = await browser.newPage();
    console.log(`📄 Created new page`);
    
    // Guard clause - ensure page was created
    if (!page) {
      throw new Error('Page was not created');
    }

    // Navigate to shop page
    console.log(`🌐 [VALIDATION] Navigating to Daily Reward section...`);
    await page.goto('https://8ballpool.com/en/shop#daily_reward', {
      waitUntil: 'networkidle', 
      timeout: 30000 
    });
    console.log(`✅ [VALIDATION] Page loaded successfully`);

    await takeScreenshot(page, `screenshots/shop-page/shop-page-${eightBallPoolId}.png`, 'Initial shop page');

    // STEP 1: Handle login with comprehensive anti-bot logic
    console.log(`🔐 [VALIDATION] Starting comprehensive login process...`);
    
    // Wait for page to fully load (page is guaranteed non-null after guard clause)
    await page!.waitForTimeout(2000);
    
    // Look for login triggers with comprehensive selectors
    const loginTriggers = await page!.locator('button, a, div').filter({ hasText: /login|sign.?in|enter|join/i }).all();
    console.log(`🔍 [VALIDATION] Found ${loginTriggers.length} potential login triggers`);

    // Try hovering over elements to reveal login modal
    let loginModalFound = false;
    for (let i = 0; i < Math.min(5, loginTriggers.length); i++) {
      try {
        const trigger = loginTriggers[i];
        console.log(`🖱️ [VALIDATION] Hovering over potential trigger ${i + 1}...`);
        await trigger.hover();
        await page!.waitForTimeout(1000);
        
        // Check if login modal appeared after hover
        const modal = await page!.locator('input[type="text"], input[placeholder*="ID"], input[placeholder*="id"]').first();
        const modalVisible = await modal.isVisible().catch(() => false);
        
        if (modalVisible) {
          console.log(`✅ [VALIDATION] Login modal appeared after hover!`);
          loginModalFound = true;
          break;
        }
      } catch (error) {
        console.log(`⚠️ [VALIDATION] Error hovering over trigger ${i + 1}: ${error.message}`);
      }
    }

    // If no modal found by hovering, try clicking login buttons
    if (!loginModalFound) {
      console.log(`🔍 [VALIDATION] No modal found by hover, trying login buttons...`);
      
      const loginButtons = await page.locator('button:has-text("Login"), button:has-text("Sign in"), a:has-text("Login"), a:has-text("Sign in")').all();
      console.log(`🔍 [VALIDATION] Found ${loginButtons.length} login buttons`);

    for (let i = 0; i < loginButtons.length; i++) {
      try {
        const button = loginButtons[i];
          console.log(`🖱️ [VALIDATION] Clicking login button ${i + 1}...`);
        await button.click();
        await page!.waitForTimeout(1000);
        
        // Check if login modal appeared
        const modal = await page!.locator('input[type="text"], input[placeholder*="ID"], input[placeholder*="id"]').first();
        const modalVisible = await modal.isVisible().catch(() => false);
        
        if (modalVisible) {
            console.log(`✅ [VALIDATION] Login modal appeared after click!`);
            loginModalFound = true;
          break;
        }
      } catch (error) {
          console.log(`⚠️ [VALIDATION] Error clicking login button ${i + 1}: ${error.message}`);
        }
      }
    }

    if (!loginModalFound) {
      console.log(`⚠️ [VALIDATION] No login modal found, trying direct input search...`);
    }

    // STEP 2: Find login input field with comprehensive selectors
    console.log(`🔍 [VALIDATION] Looking for login input field with comprehensive selectors...`);
    
    let inputField: any = null;
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
      'input[class*="username"]'
    ];

    for (const selector of inputSelectors) {
      try {
        const elements = await page!.locator(selector).all();
        if (elements.length > 0) {
          // Check if any of these elements are visible
          for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const isVisible = await element.isVisible().catch(() => false);
            if (isVisible) {
              inputField = element;
              console.log(`✅ [VALIDATION] Found visible ${selector} input field at index ${i}`);
              break;
            }
          }
          if (inputField) break;
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    if (!inputField) {
      console.log(`⚠️ [VALIDATION] No visible input field found, trying modal inputs...`);
      // Try to find any input in a modal or dialog
      const modalInputs = await page!.locator('[role="dialog"] input, .modal input, .popup input, [class*="modal"] input').all();
      if (modalInputs.length > 0) {
        for (let i = 0; i < modalInputs.length; i++) {
          const element = modalInputs[i];
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            inputField = element;
            console.log(`✅ [VALIDATION] Found input field in modal at index ${i}`);
            break;
          }
        }
      }
    }

    if (!inputField) {
      console.log(`❌ [VALIDATION] No input field found anywhere - cannot proceed with validation`);
      throw new Error('No input field found');
    }

    // STEP 3: Enter user ID
    console.log(`📝 [VALIDATION] Entering user ID: ${eightBallPoolId}`);
    if (inputField) {
      await inputField.hover();
      await inputField.click();
      await inputField.fill('');
      await inputField.fill(eightBallPoolId);
      console.log(`✅ [VALIDATION] Entered User ID: ${eightBallPoolId}`);
    }
    
    await takeScreenshot(page!, `screenshots/id-entry/after-id-entry-${eightBallPoolId}.png`, 'After ID entry');
    
    // STEP 4: Click Go button with comprehensive logic
    console.log(`🖱️ [VALIDATION] Looking for Go button with comprehensive logic...`);
    
    let goButtonClicked = false;

    // Method 1: Look for button that's immediately after the input field in the DOM
    if (inputField) {
      try {
        const nextElement = await inputField.locator('xpath=following-sibling::*[1]').first();
        const nextElementTag = await nextElement.evaluate(el => el.tagName);
        const nextElementText = await nextElement.textContent() || '';
        
        console.log(`🔍 [VALIDATION] Next element after input: ${nextElementTag}, text: "${nextElementText}"`);
        
        if (nextElementTag === 'BUTTON' && nextElementText.includes('Go')) {
          console.log(`✅ [VALIDATION] Found Go button as immediate next sibling`);
          await nextElement.click();
          console.log(`✅ [VALIDATION] Clicked immediate next sibling Go button`);
          goButtonClicked = true;
        }
      } catch (error) {
        console.log(`⚠️ [VALIDATION] Immediate next sibling not a Go button`);
      }
    }

    // Method 2: Look for button with specific styling
    if (!goButtonClicked) {
      try {
        const styledButtons = await page!.locator('button[style*="background"], button[class*="primary"], button[class*="submit"], button[class*="login"]').all();
        
        for (let i = 0; i < styledButtons.length; i++) {
          const button = styledButtons[i];
          const buttonText = await button.textContent() || '';
          const buttonClass = await button.getAttribute('class') || '';
          
          if (buttonText.includes('Go') && !buttonClass.includes('google')) {
            const isVisible = await button.isVisible();
            if (isVisible) {
              console.log(`✅ [VALIDATION] Found styled Go button: "${buttonText}"`);
              await button.click();
              console.log(`✅ [VALIDATION] Clicked styled Go button`);
              goButtonClicked = true;
              break;
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ [VALIDATION] No styled Go button found`);
      }
    }

    // Method 3: Look for button that's in a form with the input
    if (!goButtonClicked && inputField) {
      try {
        const form = await inputField.locator('xpath=ancestor::form').first();
        const formButtons = await form.locator('button').all();
        
        for (let i = 0; i < formButtons.length; i++) {
          const button = formButtons[i];
          const buttonText = await button.textContent() || '';
          
          if (buttonText.includes('Go')) {
            const isVisible = await button.isVisible();
            if (isVisible) {
              console.log(`✅ [VALIDATION] Found Go button in form: "${buttonText}"`);
              await button.click();
              console.log(`✅ [VALIDATION] Clicked form Go button`);
              goButtonClicked = true;
              break;
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ [VALIDATION] No form Go button found`);
      }
    }

    // Method 4: Fallback to simple text-based search
    if (!goButtonClicked) {
      try {
        const goButtons = await page.locator('button:has-text("Go"), button:has-text("Submit"), button[type="submit"]').all();
        
        for (let i = 0; i < goButtons.length; i++) {
          const button = goButtons[i];
          const isVisible = await button.isVisible();
          if (isVisible) {
            console.log(`✅ [VALIDATION] Found Go button by text search`);
            await button.click();
            console.log(`✅ [VALIDATION] Clicked Go button by text search`);
            goButtonClicked = true;
            break;
          }
        }
      } catch (error) {
        console.log(`⚠️ [VALIDATION] No Go button found by text search`);
      }
    }

    if (!goButtonClicked) {
      console.log(`❌ [VALIDATION] No Go button found - cannot proceed with validation`);
      throw new Error('No Go button found');
    }
    
    console.log(`✅ [VALIDATION] Successfully clicked Go button`);
    
    // STEP 5: Wait for response and analyze result
    console.log(`⏳ [VALIDATION] Waiting for page response...`);
    await page!.waitForTimeout(3000); // Wait for page to respond
    await takeScreenshot(page!, `screenshots/go-click/after-go-click-${eightBallPoolId}.png`, 'After Go click');
    
    // STEP 6: Check for invalid user indicators
    console.log(`🔍 [VALIDATION] Checking for invalid user indicators...`);
    
    const invalidIndicators = [
      'Invalid Unique ID',
      'Invalid ID', 
      'user not found',
      'user not valid',
      'banned',
      'not found',
      'error'
    ];
    
    const pageContent = await page!.content();
    const hasInvalidIndicator = invalidIndicators.some(indicator => 
      pageContent.toLowerCase().includes(indicator.toLowerCase())
    );
    
    // Check for red error styling on input field
    let hasErrorStyling = false;
    if (inputField) {
      hasErrorStyling = await inputField.evaluate((el: any) => {
        const styles = window.getComputedStyle(el);
        return (
          styles.borderColor.includes('red') ||
          styles.backgroundColor.includes('red') ||
          el.classList.contains('error') ||
          el.classList.contains('invalid') ||
          el.classList.contains('not-valid') ||
          el.classList.contains('is-invalid')
        );
      }).catch(() => false);
    }
    
    // Check if login modal is still visible (indicates failure)
    const loginModalStillVisible = inputField ? await inputField.isVisible().catch(() => false) : false;
    
    if (hasInvalidIndicator || hasErrorStyling || loginModalStillVisible) {
      console.log(`❌ [VALIDATION] User ${eightBallPoolId} FAILED validation`);
      console.log(`📋 [VALIDATION] Reason: Invalid user detected`);
      console.log(`📋 [VALIDATION] Indicators: ${hasInvalidIndicator ? 'Invalid text' : ''} ${hasErrorStyling ? 'Error styling' : ''} ${loginModalStillVisible ? 'Modal still visible' : ''}`);
      
      validationMetrics.invalidUsers++;
      
      // Deregister invalid user
      await deregisterUser(eightBallPoolId, 'invalid_user', 'User validation failed - invalid indicators detected');
      
      console.log(`❌ [VALIDATION] Validation complete - User rejected as invalid`);
      return;
    }
    
    // STEP 7: Check for valid user indicators
    console.log(`🔍 [VALIDATION] Checking for valid user indicators...`);
    
    const currentUrl = page!.url();
    const hasValidIndicators = (
      currentUrl.includes('profile') ||
      currentUrl.includes('dashboard') ||
      currentUrl.includes('account') ||
      pageContent.includes('welcome') ||
      pageContent.includes('logged in') ||
      pageContent.includes('profile') ||
      !loginModalStillVisible
    );
    
    if (hasValidIndicators) {
      console.log(`✅ [VALIDATION] User ${eightBallPoolId} PASSED validation`);
      console.log(`📋 [VALIDATION] Reason: Valid user detected`);
      console.log(`📋 [VALIDATION] Indicators: ${currentUrl.includes('profile') ? 'Profile page' : ''} ${!loginModalStillVisible ? 'Modal closed' : ''}`);
      
      validationMetrics.validUsers++;
      
      // Trigger first-time claim
      await triggerFirstTimeClaim(eightBallPoolId, username);
      
      console.log(`🎉 [VALIDATION] Validation process complete - User validated and claim triggered`);
      } else {
      console.log(`⚠️ [VALIDATION] User ${eightBallPoolId} - Ambiguous validation result`);
      console.log(`📋 [VALIDATION] Reason: Cannot determine validity`);
      
      validationMetrics.errors++;
      
      // Be lenient and assume valid due to unclear result
      console.log(`⚠️ [VALIDATION] Being lenient: assuming user ${eightBallPoolId} might be valid`);
      
      validationMetrics.validUsers++;
      
      // Trigger first-time claim
      await triggerFirstTimeClaim(eightBallPoolId, username);
      
      console.log(`🎉 [VALIDATION] Validation process complete - User validated (lenient) and claim triggered`);
    }
    
  } catch (error: any) {
    console.error(`❌ [VALIDATION] Error during validation: ${error.message}`);
    validationMetrics.errors++;
    
    // On error, be lenient and assume valid
    console.log(`⚠️ [VALIDATION] Error occurred - being lenient: assuming user ${eightBallPoolId} might be valid`);
    
    validationMetrics.validUsers++;
    
    // Trigger first-time claim
    await triggerFirstTimeClaim(eightBallPoolId, username);
    
    console.log(`🎉 [VALIDATION] Validation process complete - User validated (error fallback) and claim triggered`);
  } finally {
    // Cleanup
    if (page) {
      await page.close();
    }
    if (browser) {
      await browser.close();
    }
    console.log(`🔒 [VALIDATION] Validation browser closed`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('❌ Usage: npx tsx registration-validation.ts <eightBallPoolId> <username>');
    console.log('📋 Example: npx tsx registration-validation.ts 12345 "Test User"');
    process.exit(1);
  }
  
  const [eightBallPoolId, username] = args;
  
  try {
    await validateUserRegistration(eightBallPoolId, username);
    
    // Log final metrics
    const endTime = Date.now();
    const duration = endTime - validationMetrics.startTime;
    
    console.log(`\n📊 [METRICS] Validation Summary:`);
    console.log(`📊 Total Users: ${validationMetrics.totalUsers}`);
    console.log(`📊 Valid Users: ${validationMetrics.validUsers}`);
    console.log(`📊 Invalid Users: ${validationMetrics.invalidUsers}`);
    console.log(`📊 Errors: ${validationMetrics.errors}`);
    console.log(`📊 Duration: ${duration}ms`);
    
  } catch (error: any) {
    console.error(`❌ [MAIN] Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Export function for direct import
export { validateUserRegistration };

// Run main if called directly
if (require.main === module) {
  main();
}