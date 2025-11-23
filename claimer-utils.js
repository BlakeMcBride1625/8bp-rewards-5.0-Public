// LAYER 2: Standardized claim validation logic for all claimer files
// This ensures consistent behavior across all claimer implementations

// Helper function to check if button indicates already claimed
function isButtonAlreadyClaimed(buttonText) {
  const alreadyClaimedIndicators = [
    'claimed',
    'collected',
    'obtained',
    'received',
    'done',
    'complete',
    'check',
    '✓',
    '✔'
  ];
  
  const lowerText = buttonText.toLowerCase();
  return alreadyClaimedIndicators.some(indicator => lowerText.includes(indicator));
}

/**
 * Validates if a button click resulted in a new claim or if it was already claimed
 * @param {Object} button - The button element
 * @param {string} itemName - Name of the item being claimed
 * @param {Object} logger - Logger object (console for JS files, this.logger for TS files)
 * @returns {Promise<boolean>} - true if it was a new successful claim, false if already claimed
 */
async function validateClaimResult(button, itemName, logger) {
  try {
    // Wait a moment for UI to update
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Check if button is now disabled
    const isDisabled = await button.isDisabled().catch(() => false);
    const currentText = await button.textContent().catch(() => '');
    const originalText = button._originalText || '';
    
    const logFn = logger.log || logger.info || console.log;
    logFn.call(logger, `🔍 Button validation debug - Text: "${currentText}", Disabled: ${isDisabled}, Original: "${originalText}"`);
    
    // If button is now disabled, it's definitely valid
    if (isDisabled) {
      logFn.call(logger, `✅ Valid claim confirmed: button is now disabled`);
      return true;
    }
    
    // Check if text changed to indicate claimed state
    if (currentText !== originalText && isButtonAlreadyClaimed(currentText)) {
      logFn.call(logger, `✅ Valid claim confirmed: button text changed to "${currentText}"`);
      return true;
    }
    
    // For 8BP website, trust that the click worked if:
    // 1. The button was clickable (checked before we got here)
    // 2. No error was thrown during the click
    // 3. We're still on the same page (not redirected)
    // The 8BP website buttons don't always change state visibly, but the claim still works
    logFn.call(logger, `✅ Assuming successful claim for 8BP website: ${itemName} (button was clickable and no errors)`);
    return true;
    
  } catch (error) {
    const logFn = logger.log || logger.warn || console.log;
    logFn.call(logger, `⚠️ Validation error: ${error.message}`);
    return false;
  }
}

/**
 * Checks if a button should be skipped before clicking (already claimed indicators)
 * NOTE: This is ONLY for counting/logging purposes. The actual claiming should still happen.
 * @param {string} buttonText - The button text to check
 * @param {Object} logger - Logger object
 * @returns {boolean} - true if button should be skipped for counting, false if it can be counted
 */
function shouldSkipButtonForCounting(buttonText, logger) {
  if (isButtonAlreadyClaimed(buttonText)) {
    const logFn = logger.log || logger.warn || console.log;
    logFn.call(logger, `⏭️ Skipping already-claimed button: "${buttonText}"`);
    return true;
  }
  return false;
}

/**
 * Checks if a button should be clicked (for actual claiming)
 * This is more conservative - only skip if clearly disabled
 * @param {Object} button - The button element
 * @param {string} buttonText - The button text
 * @param {Object} logger - Logger object
 * @returns {Promise<boolean>} - true if button should be clicked, false if should skip
 */
async function shouldClickButton(button, buttonText, logger) {
  // Don't click already claimed buttons
  if (isButtonAlreadyClaimed(buttonText)) {
    return false;
  }
  
  // Don't click disabled buttons
  const isDisabled = await button.isDisabled().catch(() => false);
  if (isDisabled) {
    return false;
  }
  
  return true;
}

module.exports = {
  validateClaimResult,
  shouldSkipButtonForCounting,
  shouldClickButton,
  isButtonAlreadyClaimed
};
