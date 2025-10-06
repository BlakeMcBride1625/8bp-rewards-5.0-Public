// Standardized claim validation logic for all claimer files
// This ensures consistent behavior across all claimer implementations

/**
 * Validates if a button click resulted in a new claim or if it was already claimed
 * @param {Object} button - The button element
 * @param {string} itemName - Name of the item being claimed
 * @param {Object} logger - Logger object (console for JS files, this.logger for TS files)
 * @returns {Promise<boolean>} - true if it was a new successful claim, false if already claimed
 */
async function validateClaimResult(button, itemName, logger) {
  try {
    // Wait a moment for the button state to update
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get the new button text after clicking
    const newButtonText = await button.evaluate(el => el.textContent || '');
    
    // Check if the button is now disabled (indicating it was claimed)
    const isNowDisabled = await button.evaluate(el => el.disabled);
    
    // Debug: Log button state details
    logger.info(`🔍 Button validation debug - Text: "${newButtonText}", Disabled: ${isNowDisabled}, Original: "${button._originalText || 'N/A'}"`);
    
    // Check if button text indicates it was successfully claimed
    const successfullyClaimedIndicators = ['claimed', 'collected', '✓', 'checkmark', 'completed', 'claimed!', 'collected!'];
    const wasSuccessfullyClaimed = successfullyClaimedIndicators.some(indicator => 
      newButtonText && newButtonText.toLowerCase().includes(indicator.toLowerCase())
    );
    
    // Only count as successful if button shows clear signs of being claimed
    if (isNowDisabled || wasSuccessfullyClaimed) {
      logger.info(`✅ Successfully claimed item: ${itemName} (button text: "${newButtonText}", disabled: ${isNowDisabled})`);
      return true; // Count as new claim
    } else {
      // Button is still enabled and doesn't show "claimed" - but this might still be successful
      // Check if the button text changed (indicating some action occurred)
      const originalText = button._originalText || '';
      const textChanged = newButtonText !== originalText;
      
      if (textChanged) {
        logger.info(`✅ Button text changed - likely successful claim: ${itemName} (original: "${originalText}", new: "${newButtonText}")`);
        return true; // Count as new claim if text changed
      } else {
        // For 8BP website, if we got this far without errors, assume the claim was successful
        // The website might not change button text or disable buttons immediately
        logger.info(`✅ Assuming successful claim for 8BP website: ${itemName} (button text: "${newButtonText}", disabled: ${isNowDisabled})`);
        return true; // Count as new claim - be optimistic for 8BP
      }
    }
  } catch (error) {
    // If we can't check the text, be conservative and don't count it as a new claim
    logger.warn(`⚠️ Could not verify claim status for: ${itemName} - not counting as new claim`);
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
  if (!buttonText) return false;
  
  // Skip counting if button says "CLAIMED" (case insensitive)
  if (buttonText.toLowerCase().includes('claimed')) {
    logger.warn(`⏭️ Button already claimed - won't count: "${buttonText}"`);
    return true;
  }
  
  // Check multiple indicators that an item was already claimed
  const alreadyClaimedIndicators = [
    'claimed', 'already', 'collected', '✓', 'checkmark', 
    'disabled', 'greyed out', 'unavailable', 'completed'
  ];
  
  const isAlreadyClaimedBeforeClick = alreadyClaimedIndicators.some(indicator => 
    buttonText.toLowerCase().includes(indicator.toLowerCase())
  );
  
  if (isAlreadyClaimedBeforeClick) {
    logger.warn(`⏭️ Button already claimed - won't count: "${buttonText}"`);
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
  try {
    // Check if button is disabled
    const isDisabled = await button.evaluate(el => el.disabled);
    if (isDisabled) {
      logger.warn(`⏭️ Skipping button - disabled/greyed out`);
      return false;
    }
    
    // Check if button is actually clickable
    const isClickable = await button.evaluate(el => !el.disabled && el.offsetParent !== null);
    if (!isClickable) {
      logger.warn(`⏭️ Skipping button - not clickable`);
      return false;
    }
    
    // Only skip clicking if button clearly says it's already claimed
    if (buttonText && buttonText.toLowerCase().includes('claimed')) {
      logger.warn(`⏭️ Skipping button - already claimed: "${buttonText}"`);
      return false;
    }
    
    return true; // Click the button
  } catch (error) {
    logger.warn(`⚠️ Error checking button state - will attempt to click anyway`);
    return true; // If we can't check, try clicking anyway
  }
}

module.exports = {
  validateClaimResult,
  shouldSkipButtonForCounting,
  shouldClickButton
};
