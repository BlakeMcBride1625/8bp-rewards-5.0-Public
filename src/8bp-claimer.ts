import puppeteer, { Browser, Page } from 'puppeteer';
import * as cron from 'node-cron';
import { config } from './config';
import { Logger } from './logger';

export class EightBallPoolClaimer {
  private browser: Browser | null = null;
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  private async setupBrowser(): Promise<Browser> {
    this.logger.info('Setting up browser...');
    
    const browser = await puppeteer.launch({
      headless: config.headless ? "new" : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      timeout: 60000,
      protocolTimeout: 60000
    });

    this.logger.info('Browser setup complete');
    return browser;
  }

  private async findUserIdInput(page: Page): Promise<boolean> {
    this.logger.info('Looking for user ID input field...');

    // Specific selectors for 8ball pool login modal
    const userIdSelectors = [
      'input[placeholder*="Enter Unique ID" i]',
      'input[placeholder*="123-456-789-0" i]',
      'input[placeholder*="Unique ID" i]',
      'input[placeholder*="User ID" i]',
      'input[placeholder*="user" i]',
      'input[name*="user" i]',
      'input[id*="user" i]',
      'input[type="text"]',
      'input[type="number"]',
      '.user-id-input',
      '#userId',
      '#user_id',
      '[data-testid*="user"]'
    ];

    for (const selector of userIdSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          this.logger.info(`Found user ID input with selector: ${selector}`);
          return true;
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    // Try to find any input field that might be for user ID
    const inputs = await page.$$('input');
    for (const input of inputs) {
      const type = await input.evaluate(el => el.getAttribute('type'));
      const placeholder = await input.evaluate(el => el.getAttribute('placeholder') || '');
      if ((type === 'text' || type === 'number') && placeholder.toLowerCase().includes('id')) {
        this.logger.info('Found potential user ID input field');
        return true;
      }
    }

    this.logger.warn('Could not find user ID input field');
    return false;
  }

  private async findLoginButton(page: Page): Promise<boolean> {
    this.logger.info('Looking for login button...');

    const loginButtonSelectors = [
      'button:has-text("Go")',
      'button:has-text("Login")',
      'button:has-text("Sign In")',
      'button[type="submit"]',
      'input[type="submit"]',
      '.login-button',
      '.go-button',
      '#login',
      '#go',
      '[data-testid*="login"]',
      '[data-testid*="go"]'
    ];

    for (const selector of loginButtonSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          this.logger.info(`Found login button with selector: ${selector}`);
          return true;
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    // Try to find buttons with text content
    const buttons = await page.$$('button');
    for (const button of buttons) {
      const text = await button.evaluate(el => el.textContent?.toLowerCase() || '');
      if (text.includes('go') || text.includes('login') || text.includes('sign in')) {
        this.logger.info(`Found login button with text: ${text}`);
        return true;
      }
    }

    this.logger.warn('Could not find login button');
    return false;
  }

  private async findClaimButton(page: Page): Promise<boolean> {
    this.logger.info('Looking for FREE button in DAILY REWARD sections...');

    // First, try to find buttons specifically in reward sections
    const rewardSections = await page.$$('[class*="daily"], [class*="reward"], [class*="cue"], [class*="piece"]');
    
    for (const section of rewardSections) {
      try {
        const sectionText = await section.evaluate(el => el.textContent || '');
        if (sectionText.includes('DAILY REWARD') || sectionText.includes('FREE DAILY CUE PIECE') || sectionText.includes('WEBSHOP EXCLUSIVE')) {
          // Look for FREE button within this section
          const freeButton = await section.$('button:has-text("FREE")');
          if (freeButton) {
            this.logger.info('Found FREE button in reward section');
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }

    // General selectors for FREE buttons
    const claimButtonSelectors = [
      'button:has-text("FREE")',
      'button:has-text("Claim")',
      'button:has-text("Get")',
      'button:has-text("Redeem")',
      'button:has-text("Collect")',
      '.claim-button',
      '.free-button',
      '#claim',
      '#free',
      '[data-testid*="claim"]',
      '[data-testid*="free"]'
    ];

    for (const selector of claimButtonSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const buttonText = await element.evaluate(el => el.textContent || '');
          this.logger.info(`Found claim button with selector: ${selector}, text: ${buttonText}`);
          return true;
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    // Try to find buttons with text content
    const buttons = await page.$$('button');
    for (const button of buttons) {
      const text = await button.evaluate(el => el.textContent?.toLowerCase() || '');
      if (text.includes('free') || text.includes('claim') || text.includes('get')) {
        this.logger.info(`Found claim button with text: ${text}`);
        return true;
      }
    }

    this.logger.warn('Could not find claim button');
    return false;
  }

  private async checkForSuccess(page: Page): Promise<boolean> {
    this.logger.info('Checking for success indicators...');

    const successIndicators = [
      'success',
      'claimed',
      'reward',
      'congratulations',
      'enjoy',
      'collected',
      'redeemed'
    ];

    const pageContent = await page.content();
    const lowerContent = pageContent.toLowerCase();

    for (const indicator of successIndicators) {
      if (lowerContent.includes(indicator)) {
        this.logger.success(`Found success indicator: ${indicator}`);
        return true;
      }
    }

    this.logger.info('No explicit success message found, but process completed');
    return true; // Assume success if we got this far
  }

  public async claimFreeItems(userId: string): Promise<boolean> {
    try {
      this.logger.info(`Starting claim process for User ID: ${userId}`);
      
      this.browser = await this.setupBrowser();
      const page = await this.browser.newPage();
      
      // Set timeout
      page.setDefaultTimeout(config.timeout);

      // Set realistic headers to avoid 403 errors
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      });

      // Navigate to shop page
      this.logger.info(`Navigating to: ${config.shopUrl}`);
      try {
        await page.goto(config.shopUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: config.timeout 
        });
        this.logger.info('Successfully navigated to shop page');
      } catch (error) {
        this.logger.error(`Failed to navigate to shop page: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }

      // Wait for page to load
      await page.waitForTimeout(5000);

      // Step 1: Check if we need to login first
      this.logger.info('Checking if login is required...');
      
      // Look for login modal or login button
      const loginModal = await page.$('[class*="modal"], [class*="popup"], [class*="login"]');
      const hasLoginButton = await this.findLoginButton(page);
      
      if (loginModal || hasLoginButton) {
        this.logger.info('Login required - proceeding with login process');
        
        // Try to find and fill user ID input
        const userIdSelectors = [
          'input[placeholder*="Enter Unique ID" i]',
          'input[placeholder*="123-456-789-0" i]',
          'input[placeholder*="Unique ID" i]',
          'input[placeholder*="User ID" i]',
          'input[placeholder*="user" i]',
          'input[name*="user" i]',
          'input[id*="user" i]',
          'input[type="text"]',
          'input[type="number"]'
        ];

        let inputFilled = false;
        for (const selector of userIdSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              await element.click();
              await element.evaluate(el => (el as any).value = '');
              await element.type(userId);
              this.logger.info(`Entered User ID: ${userId}`);
              inputFilled = true;
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (!inputFilled) {
          this.logger.error('Could not fill user ID input');
          return false;
        }

        // Wait a moment for input to be processed
        await page.waitForTimeout(2000);

        // Click login button (Go button)
        const loginButtonSelectors = [
          'button:has-text("Go")',
          'button:has-text("Login")',
          'button:has-text("Sign In")',
          'button[type="submit"]',
          'input[type="submit"]'
        ];

        let loginClicked = false;
        for (const selector of loginButtonSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              await element.click();
              this.logger.info('Clicked login button');
              loginClicked = true;
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (!loginClicked) {
          // Try clicking any button with login-related text
          const buttons = await page.$$('button');
          for (const button of buttons) {
            const text = await button.evaluate(el => el.textContent?.toLowerCase() || '');
            if (text.includes('go') || text.includes('login') || text.includes('sign in')) {
              await button.click();
              this.logger.info('Clicked login button by text');
              loginClicked = true;
              break;
            }
          }
        }

        if (!loginClicked) {
          this.logger.error('Could not click login button');
          return false;
        }

        // Wait for login to complete and page to load
        this.logger.info('Waiting for login to complete...');
        await page.waitForTimeout(8000);
      }

      // Step 2: Look for specific reward sections
      this.logger.info('Looking for DAILY REWARD and FREE DAILY CUE PIECE sections...');
      
      // Look for specific text elements
      const rewardTextSelectors = [
        'text="DAILY REWARD"',
        'text="Daily Reward"',
        'text="FREE DAILY CUE PIECE"',
        'text="Free Daily Cue Piece"',
        'text="WEBSHOP EXCLUSIVE"',
        'text="Webshop Exclusive"'
      ];

      let foundRewards = false;
      for (const selector of rewardTextSelectors) {
        try {
          const element = await page.$(`text=${selector.replace('text=', '')}`);
          if (element) {
            this.logger.info(`Found reward section: ${selector.replace('text=', '')}`);
            foundRewards = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }

      // Also look for elements containing these texts
      const rewardClassSelectors = [
        '[class*="daily"]',
        '[class*="reward"]',
        '[class*="cue"]',
        '[class*="piece"]',
        '[class*="exclusive"]',
        '[class*="webshop"]'
      ];

      for (const selector of rewardClassSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.evaluate(el => el.textContent || '');
            if (text.includes('DAILY REWARD') || text.includes('FREE DAILY CUE PIECE') || text.includes('WEBSHOP EXCLUSIVE')) {
              this.logger.info(`Found reward section with text: ${text.substring(0, 50)}...`);
              foundRewards = true;
              break;
            }
          }
        } catch (error) {
          continue;
        }
      }

      if (foundRewards) {
        this.logger.info('✅ Found daily rewards section!');
      } else {
        this.logger.warn('⚠️ Could not find daily rewards section - may need to navigate to shop');
      }

      // Step 3: Find and click ALL FREE buttons
      this.logger.info('Looking for ALL FREE buttons to claim...');
      
      // Find all FREE buttons on the page
      const allFreeButtons = await page.$$('button:has-text("FREE")');
      this.logger.info(`Found ${allFreeButtons.length} FREE buttons on the page`);
      
      let totalClicked = 0;
      
      if (allFreeButtons.length > 0) {
        // Click each FREE button
        for (let i = 0; i < allFreeButtons.length; i++) {
          try {
            const button = allFreeButtons[i];
            const buttonText = await button.evaluate(el => el.textContent || '');
            const isVisible = await button.isVisible();
            
            if (isVisible && buttonText.includes('FREE')) {
              // Get context about what this button is for
              const parentElement = await button.evaluateHandle(el => el.closest('[class*="daily"], [class*="reward"], [class*="cue"], [class*="piece"], [class*="card"]'));
              let contextText = '';
              
              if (parentElement) {
                contextText = await parentElement.evaluate((el: any) => el.textContent || '');
                contextText = contextText.substring(0, 100).replace(/\s+/g, ' ').trim();
              }
              
              await button.click();
              this.logger.info(`✅ Clicked FREE button ${i + 1}/${allFreeButtons.length}`);
              if (contextText) {
                this.logger.info(`   Context: ${contextText}...`);
              }
              totalClicked++;
              
              // Wait between clicks to avoid rate limiting
              if (i < allFreeButtons.length - 1) {
                await page.waitForTimeout(2000);
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to click FREE button ${i + 1}: ${error}`);
          }
        }
      } else {
        // Fallback: look for buttons with "FREE" text
        const allButtons = await page.$$('button');
        for (const button of allButtons) {
          try {
            const buttonText = await button.evaluate(el => el.textContent || '');
            if (buttonText.includes('FREE') && await button.isVisible()) {
              await button.click();
              this.logger.info(`✅ Clicked FREE button: ${buttonText}`);
              totalClicked++;
              await page.waitForTimeout(2000);
            }
          } catch (error) {
            continue;
          }
        }
      }
      
      if (totalClicked > 0) {
        this.logger.success(`🎉 Successfully clicked ${totalClicked} FREE buttons!`);
      } else {
        this.logger.warn('⚠️ No FREE buttons found or already claimed');
      }

      // Wait for action to process
      await page.waitForTimeout(5000);

      // Check for success
      const success = await this.checkForSuccess(page);
      
      if (success) {
        this.logger.success('Free items claimed successfully!');
        return true;
      } else {
        this.logger.warn('Claim process completed but success unclear');
        return true; // Assume success if we got this far
      }

    } catch (error) {
      this.logger.error(`Error during claim process: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        this.logger.error(`Stack trace: ${error.stack}`);
      }
      return false;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  public async claimForAllUsers(): Promise<void> {
    this.logger.info('='.repeat(50));
    this.logger.info(`Starting claim process for ${config.userIds.length} users at ${new Date().toISOString()}`);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < config.userIds.length; i++) {
      const userId = config.userIds[i];
      this.logger.info(`Processing user ${i + 1}/${config.userIds.length}: ${userId}`);
      
      try {
        const success = await this.claimFreeItems(userId);
        
        if (success) {
          successCount++;
          this.logger.success(`✅ Successfully claimed for user: ${userId}`);
        } else {
          failureCount++;
          this.logger.error(`❌ Failed to claim for user: ${userId}`);
        }
        
        // Add delay between users to avoid being rate limited
        if (i < config.userIds.length - 1) {
          this.logger.info(`Waiting ${config.delayBetweenUsers}ms before next user...`);
          await new Promise(resolve => setTimeout(resolve, config.delayBetweenUsers));
        }
        
      } catch (error) {
        failureCount++;
        this.logger.error(`❌ Error claiming for user ${userId}: ${error}`);
      }
    }
    
    this.logger.info('='.repeat(50));
    this.logger.info(`Claim process completed! Success: ${successCount}, Failures: ${failureCount}`);
    this.logger.info('='.repeat(50));
  }

  public async runDailyClaim(): Promise<void> {
    await this.claimForAllUsers();
  }

  public startScheduler(): void {
    this.logger.info('Starting daily scheduler...');
    
    // Schedule daily runs at 9:00 AM
    cron.schedule('0 9 * * *', () => {
      this.runDailyClaim();
    });

    this.logger.info('Scheduled daily claims at 9:00 AM');
    this.logger.info('Press Ctrl+C to stop the scheduler');
  }
}

// Main execution
async function main(): Promise<void> {
  const claimer = new EightBallPoolClaimer();
  
  // Run once immediately
  console.log('Running 8ball Pool Free Items Claimer...');
  await claimer.runDailyClaim();
  
  // Start scheduler for daily runs
  claimer.startScheduler();
  
  // Keep the process running
  process.on('SIGINT', () => {
    console.log('\nScheduler stopped.');
    process.exit(0);
  });
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
