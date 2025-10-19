/**
 * Debug script to analyze 8BP website structure
 * This will help us understand what changed and update our selectors
 */

const { chromium } = require('playwright');
const fs = require('fs');

// Helper function to safely take screenshots with error handling
async function takeScreenshot(page, path, description) {
  try {
    // Ensure directory exists
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      console.log(`📁 Created directory: ${dir}`);
    }
    
    await page.screenshot({ path });
    console.log(`📸 ${description}: ${path}`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Screenshot failed for ${description}: ${error.message}`);
    console.warn(`⚠️ This won't affect the debug process - continuing without screenshot`);
    return false;
  }
}

async function debugWebsite() {
  console.log('🔍 Starting website debug analysis...');
  
  const browser = await chromium.launch({ 
    headless: true, // Run in headless mode for server
    slowMo: 500 // Slow down for observation
  });
  
  try {
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    console.log('🌐 Navigating to 8BP website...');
    await page.goto('https://8ballpool.com', { waitUntil: 'networkidle' });
    
    // Wait a bit for page to fully load
    await page.waitForTimeout(3000);
    
    console.log('📸 Taking initial screenshot...');
    await takeScreenshot(page, 'screenshots/debug-initial.png', 'Initial debug page');
    
    // Check what we can see on the page
    console.log('🔍 Analyzing page content...');
    
    // Check for common login elements
    const loginSelectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[placeholder*="id" i]',
      'input[placeholder*="user" i]',
      'input[placeholder*="name" i]',
      '.login input',
      '#login input',
      '[class*="login"] input',
      'input[name*="user"]',
      'input[name*="id"]'
    ];
    
    console.log('🔍 Checking for login inputs...');
    for (const selector of loginSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
        for (let i = 0; i < elements.length; i++) {
          const placeholder = await elements[i].getAttribute('placeholder');
          const name = await elements[i].getAttribute('name');
          const type = await elements[i].getAttribute('type');
          console.log(`  - Element ${i}: placeholder="${placeholder}", name="${name}", type="${type}"`);
        }
      }
    }
    
    // Check for buttons
    console.log('🔍 Checking for buttons...');
    const buttonSelectors = [
      'button',
      'input[type="button"]',
      'input[type="submit"]',
      '[role="button"]',
      '.btn',
      '[class*="button"]'
    ];
    
    for (const selector of buttonSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} buttons with selector: ${selector}`);
        for (let i = 0; i < Math.min(elements.length, 10); i++) { // Limit to first 10
          const text = await elements[i].textContent();
          const className = await elements[i].getAttribute('class');
          console.log(`  - Button ${i}: text="${text?.trim()}", class="${className}"`);
        }
      }
    }
    
    // Check for FREE/CLAIM related elements
    console.log('🔍 Checking for FREE/CLAIM elements...');
    const freeSelectors = [
      '[class*="free" i]',
      '[id*="free" i]',
      'button:has-text("FREE")',
      'button:has-text("CLAIM")',
      'button:has-text("Claim")',
      '[class*="claim" i]',
      '[id*="claim" i]'
    ];
    
    for (const selector of freeSelectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          console.log(`✅ Found ${elements.length} FREE/CLAIM elements with selector: ${selector}`);
          for (let i = 0; i < Math.min(elements.length, 5); i++) {
            const text = await elements[i].textContent();
            const className = await elements[i].getAttribute('class');
            console.log(`  - Element ${i}: text="${text?.trim()}", class="${className}"`);
          }
        }
      } catch (error) {
        // Some selectors might not be supported
        console.log(`❌ Error with selector ${selector}: ${error.message}`);
      }
    }
    
    // Check page title and URL
    const title = await page.title();
    const url = page.url();
    console.log(`📄 Page title: "${title}"`);
    console.log(`🌐 Current URL: "${url}"`);
    
    // Check for any error messages or alerts
    console.log('🔍 Checking for error messages...');
    const errorSelectors = [
      '.error',
      '.alert',
      '[class*="error"]',
      '[class*="alert"]',
      '[class*="warning"]',
      '.message'
    ];
    
    for (const selector of errorSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`⚠️ Found ${elements.length} error/alert elements with selector: ${selector}`);
        for (let i = 0; i < elements.length; i++) {
          const text = await elements[i].textContent();
          console.log(`  - Error ${i}: "${text?.trim()}"`);
        }
      }
    }
    
    // Take final screenshot
    console.log('📸 Taking final screenshot...');
    await takeScreenshot(page, 'screenshots/debug-final.png', 'Final debug page');
    
    console.log('✅ Debug analysis complete!');
    console.log('📸 Check screenshots/debug-initial.png and screenshots/debug-final.png');
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  } finally {
    await browser.close();
  }
}

// Run the debug
debugWebsite().catch(console.error);
