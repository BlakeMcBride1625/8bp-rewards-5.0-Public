import { chromium, Page, Browser } from 'playwright';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { logger } from '../services/LoggerService';
import { generateValidationCorrelationId } from '../utils/correlationId';
import { 
  TIMEOUTS, 
  CORRELATION_ID_PREFIXES, 
  SOURCE_MODULES,
  VALIDATION_REASONS,
  INVALID_USER_INDICATORS,
  VALID_USER_INDICATORS,
  SCREENSHOT_PATHS,
  ERROR_MESSAGES
} from '../constants';

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
    logger.info(`Screenshot taken: ${description}`, {
      action: 'validation_screenshot',
      filename,
      description
    });
  } catch (error) {
    logger.warn(`Screenshot failed: ${description}`, {
      action: 'validation_screenshot_error',
      filename,
      description,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function deregisterUser(eightBallPoolId: string, reason: string, errorMessage?: string): Promise<void> {
  try {
    logger.info('Removing invalid user from database', {
      action: 'deregister_user',
      eightBallPoolId,
      reason
    });
    
    // Remove from registrations table
    await dbService.removeUserByEightBallPoolId(eightBallPoolId);
    
    // Create invalid user record with correct field names matching InvalidUserData interface
    await dbService.createInvalidUserRecord({
      eightBallPoolId: eightBallPoolId,
      deregistrationReason: reason,
      sourceModule: SOURCE_MODULES.REGISTRATION_VALIDATION,
      errorMessage: errorMessage || ERROR_MESSAGES.VALIDATION_FAILED,
      deregisteredAt: new Date(),
      correlationId: generateValidationCorrelationId(eightBallPoolId),
      context: {
        validationType: 'registration',
        timestamp: new Date().toISOString()
      }
    });
    
    logger.info('Successfully deregistered user', {
      action: 'deregister_user_success',
      eightBallPoolId,
      reason
    });
  } catch (error) {
    logger.error('Failed to deregister user', {
      action: 'deregister_user_error',
      eightBallPoolId,
      reason,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function triggerFirstTimeClaim(eightBallPoolId: string, username: string): Promise<void> {
  // Fire and forget - don't block validation script
  // Spawn the claim process immediately (not in setTimeout) to ensure it starts before process.exit
  try {
    console.log(`✅ [VALIDATION] Triggering first-time claim for ${eightBallPoolId}`);
    logger.info('Triggering first-time claim for validated user', {
      action: 'trigger_first_time_claim',
      eightBallPoolId,
      username
    });
    
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
      console.log(`❌ [VALIDATION] Could not find first-time-claim.js script for ${eightBallPoolId}`);
      logger.error('Could not find first-time-claim.js script', {
        action: 'first_time_claim_script_not_found',
        eightBallPoolId,
        username,
        triedPaths: possibleClaimScriptPaths
      });
      return;
    }
    
    console.log(`✅ [VALIDATION] Running first-time claim script: ${claimScript}`);
    logger.info('Running first-time claim script', {
      action: 'first_time_claim_start',
      eightBallPoolId,
      username,
      scriptPath: claimScript
    });
    
    // Spawn immediately - use detached: true but redirect stdio to files so child survives parent exit
    // Redirect stdout/stderr to log files so child doesn't depend on parent's pipes
    const fsModule = require('fs');
    const pathModule = require('path');
    const logsDir = pathModule.join(process.cwd(), 'logs');
    if (!fsModule.existsSync(logsDir)) {
      fsModule.mkdirSync(logsDir, { recursive: true });
    }
    const stdoutFile = pathModule.join(logsDir, `first-time-claim-${eightBallPoolId}-${Date.now()}.stdout.log`);
    const stderrFile = pathModule.join(logsDir, `first-time-claim-${eightBallPoolId}-${Date.now()}.stderr.log`);
    const stdoutFd = fsModule.openSync(stdoutFile, 'w');
    const stderrFd = fsModule.openSync(stderrFile, 'w');
    
    const claimProcess = spawn('node', [claimScript, eightBallPoolId, username], {
      stdio: ['ignore', stdoutFd, stderrFd],
      cwd: process.cwd(),
      detached: true  // Detach so child can survive parent exit
    });
    
    // Unref so parent can exit, but child will continue running independently
    claimProcess.unref();
    
    // Close file descriptors in parent (child has its own copies)
    fsModule.closeSync(stdoutFd);
    fsModule.closeSync(stderrFd);
    
    // Set a timeout for the claim process
    const timeout = setTimeout(() => {
      logger.warn('Claim process timeout - killing process', {
        action: 'first_time_claim_timeout',
        eightBallPoolId,
        username
      });
      claimProcess.kill('SIGKILL');
    }, TIMEOUTS.VALIDATION_CLAIM);
    
    let stdout = '';
    let stderr = '';
    
    claimProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      // Log important progress - include heartbeat and timeout messages
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        if (line.includes('[STAGE_2]') || line.includes('✅') || line.includes('❌') || line.includes('🎁') || line.includes('📋') || line.includes('⏱️') || line.includes('TIMEOUT')) {
          logger.info('First-time claim progress', {
            action: 'first_time_claim_progress',
            eightBallPoolId,
            username,
            progress: line.trim()
          });
        }
      });
    });
    
    claimProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      // Log stderr with more detail, especially for [STAGE_2] messages
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        if (line.includes('[STAGE_2]') || line.includes('TIMEOUT') || line.includes('❌')) {
          logger.warn('First-time claim stderr (important)', {
            action: 'first_time_claim_stderr_important',
            eightBallPoolId,
            username,
            stderr: line.trim()
          });
        }
      });
      // Also log full stderr for debugging
      if (data.toString().trim()) {
        logger.debug('First-time claim stderr (full)', {
          action: 'first_time_claim_stderr',
          eightBallPoolId,
          username,
          stderr: data.toString().trim()
        });
      }
    });
    
    claimProcess.on('close', (code: number | null) => {
      clearTimeout(timeout);
      if (code === 0) {
        logger.info('First-time claim completed successfully', {
          action: 'first_time_claim_success',
          eightBallPoolId,
          username
        });
      } else {
        logger.warn('First-time claim failed', {
          action: 'first_time_claim_failed',
          eightBallPoolId,
          username,
          exitCode: code
        });
      }
    });
    
    claimProcess.on('error', (error: Error) => {
      clearTimeout(timeout);
      logger.error('First-time claim process error', {
        action: 'first_time_claim_process_error',
        eightBallPoolId,
        username,
        error: error.message
      });
    });
    
    // Give spawn a moment to actually start before returning
    // This ensures the process is spawned before the parent exits
    await new Promise(resolve => setImmediate(resolve));
    
  } catch (error) {
    logger.error('Failed to trigger first-time claim', {
      action: 'first_time_claim_error',
      eightBallPoolId,
      username,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  
  // Return immediately - don't wait for claim process to complete
  // This allows validation script to continue and cleanup browser
  return Promise.resolve();
}

async function validateUserRegistration(eightBallPoolId: string, username: string): Promise<void> {
  logger.info('Starting registration validation', {
    action: 'validation_start',
    eightBallPoolId,
    username,
    stage: 'Stage 1: User Validation Only'
  });
  
  validationMetrics.totalUsers++;

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Connect to database
    logger.info('Connecting to PostgreSQL', {
      action: 'validation_db_connect',
      eightBallPoolId,
      username
    });
    await dbService.connect();
    logger.info('Connected to database', {
      action: 'validation_db_connected',
      eightBallPoolId,
      username
    });

    // Launch browser
    logger.info('Launching validation browser', {
      action: 'validation_browser_launch',
      eightBallPoolId,
      username
    });
    
    // Launch browser with robust options for headless environment
    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-gpu'
      ]
    };
    
    // If running in Docker, use system chromium (faster, already installed)
    // Otherwise, Playwright will use its downloaded browsers
    if (process.env.CHROMIUM_PATH) {
      launchOptions.executablePath = process.env.CHROMIUM_PATH;
      logger.info('Using system chromium from CHROMIUM_PATH', {
        path: process.env.CHROMIUM_PATH
      });
    } else if (process.env.CHROME_BIN) {
      launchOptions.executablePath = process.env.CHROME_BIN;
      logger.info('Using system chromium from CHROME_BIN', {
        path: process.env.CHROME_BIN
      });
    }
    
    try {
      browser = await chromium.launch(launchOptions);
    } catch (error: any) {
      logger.error('Failed to launch browser', {
        action: 'browser_launch_error',
        eightBallPoolId,
        username,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to launch browser: ${error.message}`);
    }
    
    page = await browser.newPage();
    logger.info('Created new page', {
      action: 'validation_page_created',
      eightBallPoolId,
      username
    });
    
    // Guard clause - ensure page was created
    if (!page) {
      throw new Error('Page was not created');
    }

    // Set realistic headers like manual claims to avoid detection
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"'
    });

    // Navigate to shop page
    logger.info('Navigating to Daily Reward section', {
      action: 'validation_navigate',
      eightBallPoolId,
      username
    });
    await page.goto('https://8ballpool.com/en/shop#daily_reward', {
      waitUntil: 'domcontentloaded', 
      timeout: TIMEOUTS.PAGE_NAVIGATION
    });
    logger.info('Page DOM loaded, waiting for full render', {
      action: 'validation_page_loaded',
      eightBallPoolId,
      username
    });

    // Wait for page to fully render (like manual claims do)
    await page.waitForTimeout(5000);
    console.log(`✅ [VALIDATION] Page fully loaded for ${eightBallPoolId}`);

    await takeScreenshot(page, `${SCREENSHOT_PATHS.SHOP_PAGE}/shop-page-${eightBallPoolId}.png`, 'Initial shop page');
    console.log(`✅ [VALIDATION] Shop page screenshot taken for ${eightBallPoolId}`);

    // STEP 1: Handle login with comprehensive anti-bot logic
    console.log(`✅ [VALIDATION] Starting comprehensive login process for ${eightBallPoolId}`);
    logger.info('Starting comprehensive login process', {
      action: 'validation_login_start',
      eightBallPoolId,
      username
    });
    
    // Wait for page to fully load (page is guaranteed non-null after guard clause)
    await page!.waitForTimeout(2000);
    
    // Look for login triggers with comprehensive selectors
    const loginTriggers = await page!.locator('button, a, div').filter({ hasText: /login|sign.?in|enter|join/i }).all();
    logger.debug(`Found ${loginTriggers.length} potential login triggers`, {
      action: 'validation_login_triggers',
      eightBallPoolId,
      username,
      count: loginTriggers.length
    });

    // Try hovering over elements to reveal login modal
    let loginModalFound = false;
    for (let i = 0; i < Math.min(5, loginTriggers.length); i++) {
      try {
        const trigger = loginTriggers[i];
        logger.debug(`Hovering over potential trigger ${i + 1}`, {
          action: 'validation_hover_trigger',
          eightBallPoolId,
          username,
          triggerIndex: i + 1
        });
        await trigger.hover();
        await page!.waitForTimeout(1000);
        
        // Check if login modal appeared after hover
        const modal = await page!.locator('input[type="text"], input[placeholder*="ID"], input[placeholder*="id"]').first();
        const modalVisible = await modal.isVisible().catch(() => false);
        
        if (modalVisible) {
          logger.info('Login modal appeared after hover', {
            action: 'validation_modal_found',
            eightBallPoolId,
            username,
            method: 'hover'
          });
          loginModalFound = true;
          break;
        }
      } catch (error) {
        logger.debug(`Error hovering over trigger ${i + 1}`, {
          action: 'validation_hover_error',
          eightBallPoolId,
          username,
          triggerIndex: i + 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // If no modal found by hovering, try clicking login buttons
    if (!loginModalFound) {
      logger.debug('No modal found by hover, trying login buttons', {
        action: 'validation_try_login_buttons',
        eightBallPoolId,
        username
      });
      
      const loginButtons = await page.locator('button:has-text("Login"), button:has-text("Sign in"), a:has-text("Login"), a:has-text("Sign in")').all();
      logger.debug(`Found ${loginButtons.length} login buttons`, {
        action: 'validation_login_buttons_found',
        eightBallPoolId,
        username,
        count: loginButtons.length
      });

    for (let i = 0; i < loginButtons.length; i++) {
      try {
        const button = loginButtons[i];
          logger.debug(`Clicking login button ${i + 1}`, {
            action: 'validation_click_login_button',
            eightBallPoolId,
            username,
            buttonIndex: i + 1
          });
        await button.click();
        await page!.waitForTimeout(1000);
        
        // Check if login modal appeared
        const modal = await page!.locator('input[type="text"], input[placeholder*="ID"], input[placeholder*="id"]').first();
        const modalVisible = await modal.isVisible().catch(() => false);
        
        if (modalVisible) {
            logger.info('Login modal appeared after click', {
              action: 'validation_modal_found',
              eightBallPoolId,
              username,
              method: 'click'
            });
            loginModalFound = true;
          break;
        }
      } catch (error) {
          logger.debug(`Error clicking login button ${i + 1}`, {
            action: 'validation_click_error',
            eightBallPoolId,
            username,
            buttonIndex: i + 1,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    if (!loginModalFound) {
      logger.debug('No login modal found, trying direct input search', {
        action: 'validation_direct_input_search',
        eightBallPoolId,
        username
      });
    }

    // STEP 2: Find login input field with comprehensive selectors
    logger.debug('Looking for login input field with comprehensive selectors', {
      action: 'validation_find_input',
      eightBallPoolId,
      username
    });
    
    let inputField: Awaited<ReturnType<Page['locator']>> | null = null;
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
              logger.info(`Found visible input field`, {
                action: 'validation_input_found',
                eightBallPoolId,
                username,
                selector,
                index: i
              });
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
      logger.debug('No visible input field found, trying modal inputs', {
        action: 'validation_try_modal_inputs',
        eightBallPoolId,
        username
      });
      // Try to find any input in a modal or dialog
      const modalInputs = await page!.locator('[role="dialog"] input, .modal input, .popup input, [class*="modal"] input').all();
      if (modalInputs.length > 0) {
        for (let i = 0; i < modalInputs.length; i++) {
          const element = modalInputs[i];
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            inputField = element;
            logger.info('Found input field in modal', {
              action: 'validation_input_found_modal',
              eightBallPoolId,
              username,
              index: i
            });
            break;
          }
        }
      }
    }

    if (!inputField) {
      logger.error('No input field found anywhere - cannot proceed with validation', {
        action: 'validation_no_input_field',
        eightBallPoolId,
        username
      });
      throw new Error('No input field found');
    }

    // STEP 3: Enter user ID
    logger.info('Entering user ID', {
      action: 'validation_enter_user_id',
      eightBallPoolId,
      username
    });
    if (inputField) {
      await inputField.hover();
      await inputField.click();
      await inputField.fill('');
      await inputField.fill(eightBallPoolId);
      logger.info('User ID entered', {
        action: 'validation_user_id_entered',
        eightBallPoolId,
        username
      });
    }
    
    await takeScreenshot(page!, `screenshots/id-entry/after-id-entry-${eightBallPoolId}.png`, 'After ID entry');
    console.log(`✅ [VALIDATION] ID entry screenshot taken for ${eightBallPoolId}`);
    
    // STEP 4: Click Go button with comprehensive logic
    logger.debug('Looking for Go button with comprehensive logic', {
      action: 'validation_find_go_button',
      eightBallPoolId,
      username
    });
    
    let goButtonClicked = false;

    // Method 1: Look for button that's immediately after the input field in the DOM
    if (inputField) {
      try {
        const nextElement = await inputField.locator('xpath=following-sibling::*[1]').first();
        const nextElementTag = await nextElement.evaluate(el => el.tagName);
        const nextElementText = await nextElement.textContent() || '';
        
        logger.debug(`Next element after input: ${nextElementTag}`, {
          action: 'validation_check_next_element',
          eightBallPoolId,
          username,
          tag: nextElementTag,
          text: nextElementText
        });
        
        if (nextElementTag === 'BUTTON' && nextElementText.includes('Go')) {
          logger.info('Found Go button as immediate next sibling', {
            action: 'validation_go_button_found',
            eightBallPoolId,
            username,
            method: 'immediate_sibling'
          });
          await nextElement.click();
          goButtonClicked = true;
        }
      } catch (error) {
        logger.debug('Immediate next sibling not a Go button', {
          action: 'validation_go_button_not_sibling',
          eightBallPoolId,
          username
        });
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
              logger.info('Found styled Go button', {
                action: 'validation_go_button_found',
                eightBallPoolId,
                username,
                method: 'styled',
                buttonText
              });
              await button.click();
              goButtonClicked = true;
              break;
            }
          }
        }
      } catch (error) {
        logger.debug('No styled Go button found', {
          action: 'validation_go_button_not_styled',
          eightBallPoolId,
          username
        });
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
              logger.info('Found Go button in form', {
                action: 'validation_go_button_found',
                eightBallPoolId,
                username,
                method: 'form',
                buttonText
              });
              await button.click();
              goButtonClicked = true;
              break;
            }
          }
        }
      } catch (error) {
        logger.debug('No form Go button found', {
          action: 'validation_go_button_not_in_form',
          eightBallPoolId,
          username
        });
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
            logger.info('Found Go button by text search', {
              action: 'validation_go_button_found',
              eightBallPoolId,
              username,
              method: 'text_search'
            });
            await button.click();
            goButtonClicked = true;
            break;
          }
        }
      } catch (error) {
        logger.debug('No Go button found by text search', {
          action: 'validation_go_button_not_found',
          eightBallPoolId,
          username
        });
      }
    }

    if (!goButtonClicked) {
      logger.error('No Go button found - cannot proceed with validation', {
        action: 'validation_go_button_error',
        eightBallPoolId,
        username
      });
      throw new Error('No Go button found');
    }
    
    logger.info('Successfully clicked Go button', {
      action: 'validation_go_button_clicked',
      eightBallPoolId,
      username
    });
    
    // STEP 5: Wait for response and analyse result
    logger.debug('Waiting for page response', {
      action: 'validation_wait_response',
      eightBallPoolId,
      username
    });
    await page!.waitForTimeout(3000); // Wait for page to respond
    await takeScreenshot(page!, `${SCREENSHOT_PATHS.GO_CLICK}/after-go-click-${eightBallPoolId}.png`, 'After Go click');
    console.log(`✅ [VALIDATION] Go click screenshot taken for ${eightBallPoolId}`);
    
    // STEP 6: Check for invalid user indicators
    logger.debug('Checking for invalid user indicators', {
      action: 'validation_check_invalid',
      eightBallPoolId,
      username
    });
    
    // Check if login modal is still visible FIRST (this is the strongest indicator)
    // If modal closed, it means login likely succeeded
    const loginModalStillVisible = inputField ? await inputField.isVisible().catch(() => false) : false;
    
    // If modal is NOT visible, prioritize that as a positive indicator
    // Only check for invalid text if modal is still visible
    let hasInvalidIndicator = false;
    let hasErrorStyling = false;
    
    // Only do expensive checks if modal is still visible (uncertain state)
    if (loginModalStillVisible) {
      const invalidIndicators = INVALID_USER_INDICATORS;
      const pageContent = await page!.content();
      hasInvalidIndicator = invalidIndicators.some(indicator => 
        pageContent.toLowerCase().includes(indicator.toLowerCase())
      );
      
      // Check for red error styling on input field
      if (inputField) {
        hasErrorStyling = await inputField.evaluate((el: HTMLElement) => {
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
    }
    
    // Only mark as invalid if modal is visible AND there are clear error indicators
    // If modal closed, that's a strong positive signal
    if (loginModalStillVisible && (hasInvalidIndicator || hasErrorStyling)) {
      logger.warn('User validation failed', {
        action: 'validation_failed',
        eightBallPoolId,
        username,
        reason: 'Invalid user detected',
        indicators: {
          invalidText: hasInvalidIndicator,
          errorStyling: hasErrorStyling,
          modalStillVisible: loginModalStillVisible
        }
      });
      
      validationMetrics.invalidUsers++;
      
      // Log validation failure
      const correlationId = generateValidationCorrelationId(eightBallPoolId);
      try {
        await dbService.createValidationLog({
          uniqueId: eightBallPoolId,
          sourceModule: SOURCE_MODULES.REGISTRATION_VALIDATION,
          validationResult: {
            isValid: false,
            reason: VALIDATION_REASONS.INVALID_USER,
            correlationId: correlationId,
            timestamp: new Date().toISOString(),
            attempts: 1,
            error: `Invalid indicators detected: modal_visible=${loginModalStillVisible} ${hasInvalidIndicator ? 'invalid_text' : ''} ${hasErrorStyling ? 'error_styling' : ''}`
          },
          context: {
            hasInvalidIndicator: hasInvalidIndicator,
            hasErrorStyling: hasErrorStyling,
            loginModalStillVisible: loginModalStillVisible,
            validationType: 'registration'
          },
          correlationId: correlationId,
          timestamp: new Date()
        });
      } catch (logError) {
        logger.warn('Failed to log validation failure', {
          action: 'validation_log_error',
          eightBallPoolId,
          error: logError instanceof Error ? logError.message : 'Unknown error'
        });
      }
      
      // Deregister invalid user
      await deregisterUser(eightBallPoolId, VALIDATION_REASONS.INVALID_USER, ERROR_MESSAGES.VALIDATION_FAILED);
      
      logger.info('Validation complete - User rejected as invalid', {
        action: 'validation_complete_invalid',
        eightBallPoolId,
        username
      });
      return;
    }
    
    // STEP 7: Check for valid user indicators
    logger.debug('Checking for valid user indicators', {
      action: 'validation_check_valid',
      eightBallPoolId,
      username
    });
    
    const currentUrl = page!.url();
    // Get page content if we need it for valid indicators check
    const pageContent = await page!.content();
    const hasValidIndicators = (
      VALID_USER_INDICATORS.URL_KEYWORDS.some(keyword => currentUrl.includes(keyword)) ||
      VALID_USER_INDICATORS.PAGE_CONTENT.some(content => pageContent.includes(content)) ||
      !loginModalStillVisible
    );
    
    if (hasValidIndicators) {
      logger.info('User validation passed', {
        action: 'validation_passed',
        eightBallPoolId,
        username,
        reason: 'Valid user detected',
        indicators: {
          profilePage: currentUrl.includes('profile'),
          modalClosed: !loginModalStillVisible
        }
      });
      
      validationMetrics.validUsers++;
      
      // Log successful validation
      const correlationId = generateValidationCorrelationId(eightBallPoolId);
      try {
        await dbService.createValidationLog({
          uniqueId: eightBallPoolId,
          sourceModule: SOURCE_MODULES.REGISTRATION_VALIDATION,
          validationResult: {
            isValid: true,
            reason: VALIDATION_REASONS.VALID_USER,
            correlationId: correlationId,
            timestamp: new Date().toISOString(),
            attempts: 1
          },
          context: {
            url: currentUrl,
            loginModalVisible: loginModalStillVisible,
            hasValidIndicators: true,
            validationType: 'registration'
          },
          correlationId: correlationId,
          timestamp: new Date()
        });
      } catch (logError) {
        logger.warn('Failed to log validation success', {
          action: 'validation_log_error',
          eightBallPoolId,
          username,
          error: logError instanceof Error ? logError.message : 'Unknown error'
        });
      }
      
      // Trigger first-time claim
      console.log(`✅ [VALIDATION] User validated successfully, triggering first-time claim for ${eightBallPoolId}`);
      await triggerFirstTimeClaim(eightBallPoolId, username);
      
      logger.info('Validation process complete - User validated and claim triggered', {
        action: 'validation_complete_success',
        eightBallPoolId,
        username
      });
      console.log(`✅ [VALIDATION] Validation complete for ${eightBallPoolId}, first-time claim triggered`);
      } else {
      logger.warn('Ambiguous validation result', {
        action: 'validation_ambiguous',
        eightBallPoolId,
        username,
        reason: 'Cannot determine validity - no clear indicators found',
        url: currentUrl,
        loginModalVisible: loginModalStillVisible
      });
      
      validationMetrics.errors++;
      
      // Log ambiguous validation result
      const correlationId = generateValidationCorrelationId(eightBallPoolId);
      try {
        await dbService.createValidationLog({
          uniqueId: eightBallPoolId,
          sourceModule: SOURCE_MODULES.REGISTRATION_VALIDATION,
          validationResult: {
            isValid: true,  // Lenient: assume valid
            reason: VALIDATION_REASONS.AMBIGUOUS_RESULT,
            correlationId: correlationId,
            timestamp: new Date().toISOString(),
            attempts: 1
          },
          context: {
            url: currentUrl,
            loginModalVisible: loginModalStillVisible,
            hasValidIndicators: false,
            validationType: 'registration'
          },
          correlationId: correlationId,
          timestamp: new Date()
        });
      } catch (logError) {
        logger.warn('Failed to log ambiguous validation', {
          action: 'validation_log_error',
          eightBallPoolId,
          username,
          error: logError instanceof Error ? logError.message : 'Unknown error'
        });
      }
      
      // Be lenient and assume valid due to unclear result
      logger.info('Being lenient: assuming user might be valid', {
        action: 'validation_lenient_mode',
        eightBallPoolId,
        username
      });
      
      validationMetrics.validUsers++;
      
      // Trigger first-time claim
      await triggerFirstTimeClaim(eightBallPoolId, username);
      
      logger.info('Validation process complete - User validated (lenient) and claim triggered', {
        action: 'validation_complete_lenient',
        eightBallPoolId,
        username
      });
    }
    
  } catch (error) {
    console.log(`❌ [VALIDATION] Error during validation for ${eightBallPoolId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error && error.stack) {
      console.log(`❌ [VALIDATION] Stack trace: ${error.stack.substring(0, 500)}`);
    }
    logger.error('Error during validation', {
      action: 'validation_error',
      eightBallPoolId,
      username,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    });
    validationMetrics.errors++;
    
    // Log validation error
    const correlationId = generateValidationCorrelationId(eightBallPoolId);
    try {
        await dbService.createValidationLog({
          uniqueId: eightBallPoolId,
          sourceModule: SOURCE_MODULES.REGISTRATION_VALIDATION,
          validationResult: {
            isValid: true,  // Lenient: assume valid on error
            reason: VALIDATION_REASONS.ERROR_FALLBACK,
            correlationId: correlationId,
            timestamp: new Date().toISOString(),
            attempts: 1,
            error: error instanceof Error ? error.message : 'Unknown error during validation'
          },
          context: {
            errorType: error instanceof Error ? error.name : 'Error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            validationType: 'registration',
            lenientMode: true
          },
          correlationId: correlationId,
          timestamp: new Date()
        });
    } catch (logError) {
      logger.warn('Failed to log validation error', {
        action: 'validation_log_error',
        eightBallPoolId,
        username,
        error: logError instanceof Error ? logError.message : 'Unknown error'
      });
    }
    
    // On error, be lenient and assume valid
    logger.info('Error occurred - being lenient: assuming user might be valid', {
      action: 'validation_error_fallback',
      eightBallPoolId,
      username,
      note: 'This is a fallback mode - actual validation could not complete'
    });
    
    validationMetrics.validUsers++;
    
    // Trigger first-time claim
    await triggerFirstTimeClaim(eightBallPoolId, username);
    
    logger.info('Validation process complete - User validated (error fallback) and claim triggered', {
      action: 'validation_complete_error_fallback',
      eightBallPoolId,
      username
    });
  } finally {
    // Cleanup - ensure browser always closes even if there were errors
    // Use Promise.allSettled to ensure cleanup doesn't block
    const cleanupPromises: Promise<void>[] = [];
    
    if (page) {
      cleanupPromises.push(
        Promise.race([
          page.close().catch(() => {}),
          new Promise<void>((resolve) => setTimeout(() => {
            logger.warn('Page close timeout, forcing continue', {
              action: 'validation_page_close_timeout',
              eightBallPoolId,
              username
            });
            resolve();
          }, 3000))
        ])
      );
    }
    
    if (browser) {
      cleanupPromises.push(
        Promise.race([
          browser.close().catch(() => {}),
          new Promise<void>((resolve) => setTimeout(() => {
            logger.warn('Browser close timeout, forcing continue', {
              action: 'validation_browser_close_timeout',
              eightBallPoolId,
              username
            });
            resolve();
          }, 3000))
        ])
      );
    }
    
    // Wait for cleanup with overall timeout
    try {
      await Promise.race([
        Promise.allSettled(cleanupPromises),
        new Promise<void>((resolve) => setTimeout(() => {
          logger.warn('Cleanup overall timeout, forcing continue', {
            action: 'validation_cleanup_overall_timeout',
            eightBallPoolId,
            username
          });
          resolve();
        }, 5000))
      ]);
    } catch (error) {
      logger.warn('Cleanup error, continuing anyway', {
        action: 'validation_cleanup_error',
        eightBallPoolId,
        username,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    logger.info('Validation browser cleanup completed', {
      action: 'validation_browser_closed',
      eightBallPoolId,
      username
    });
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    logger.error('Usage: npx tsx registration-validation.ts <eightBallPoolId> <username>', {
      action: 'validation_usage_error'
    });
    logger.info('Example: npx tsx registration-validation.ts 12345 "Test User"', {
      action: 'validation_usage_example'
    });
    process.exit(1);
  }
  
  const [eightBallPoolId, username] = args;
  
  try {
    await validateUserRegistration(eightBallPoolId, username);
    
    // Log final metrics
    const endTime = Date.now();
    const duration = endTime - validationMetrics.startTime;
    
    logger.info('Validation Summary', {
      action: 'validation_metrics',
      eightBallPoolId,
      username,
      metrics: {
        totalUsers: validationMetrics.totalUsers,
        validUsers: validationMetrics.validUsers,
        invalidUsers: validationMetrics.invalidUsers,
        errors: validationMetrics.errors,
        duration: `${duration}ms`
      }
    });
    
    // Explicitly exit to ensure process terminates
    // Give enough time for first-time claim to spawn (if it was triggered)
    // Use setImmediate to ensure the event loop processes any pending spawns
    setImmediate(() => {
      setTimeout(() => {
        process.exit(0);
      }, 2000); // Increased to 2 seconds to ensure spawn completes
    });
    
  } catch (error) {
    logger.error('Fatal error in validation main', {
      action: 'validation_main_error',
      eightBallPoolId,
      username,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }
}

// Export function for direct import
export { validateUserRegistration };

// Run main if called directly
if (require.main === module) {
  main();
}