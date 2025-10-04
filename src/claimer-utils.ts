// Standardized claim validation logic for all claimer files
// This ensures consistent behavior across all claimer implementations

/**
 * Validates if a button click resulted in a new claim or if it was already claimed
 * @param button - The button element
 * @param itemName - Name of the item being claimed
 * @param logger - Logger object
 * @returns Promise<boolean> - true if it was a new successful claim, false if already claimed
 */
export async function validateClaimResult(button: any, itemName: string, logger: any): Promise<boolean> {
  try {
    // Wait a moment for the button state to update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get the new button text after clicking
    const newButtonText = await button.evaluate((el: any) => el.textContent || '');
    
    // Check if the button is now disabled (indicating it was already claimed)
    const isNowDisabled = await button.evaluate((el: any) => el.disabled);
    
    // Check if button text indicates it was ALREADY claimed (not a new claim)
    const alreadyClaimedIndicators = ['claimed', 'collected', '✓', 'checkmark', 'completed', 'already claimed', 'already collected'];
    const wasAlreadyClaimed = alreadyClaimedIndicators.some(indicator => 
      newButtonText && newButtonText.toLowerCase().includes(indicator.toLowerCase())
    );
    
    // If button is disabled OR shows "claimed" text, it was already claimed before clicking
    if (isNowDisabled || wasAlreadyClaimed) {
      logger.warn(`⚠️ Item was already claimed: ${itemName} (button text: "${newButtonText}")`);
      return false; // Don't count as new claim
    } else {
      // Button is still enabled and doesn't show "claimed" - this is a NEW successful claim
      logger.info(`✅ Successfully claimed NEW item: ${itemName} (button text: "${newButtonText}")`);
      return true; // Count as new claim
    }
  } catch (error) {
    // If we can't check the text, be conservative and don't count it as a new claim
    logger.warn(`⚠️ Could not verify claim status for: ${itemName} - not counting as new claim`);
    return false;
  }
}

/**
 * Checks if a button should be skipped for counting (already claimed indicators)
 * NOTE: This is ONLY for counting/logging purposes. The actual claiming should still happen.
 * @param buttonText - The button text to check
 * @param logger - Logger object
 * @returns boolean - true if button should be skipped for counting, false if it can be counted
 */
export function shouldSkipButtonForCounting(buttonText: string, logger: any): boolean {
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
 * @param button - The button element
 * @param buttonText - The button text
 * @param logger - Logger object
 * @returns Promise<boolean> - true if button should be clicked, false if should skip
 */
export async function shouldClickButton(button: any, buttonText: string, logger: any): Promise<boolean> {
  try {
    // Check if button is disabled
    const isDisabled = await button.evaluate((el: any) => el.disabled);
    if (isDisabled) {
      logger.warn(`⏭️ Skipping button - disabled/greyed out`);
      return false;
    }
    
    // Check if button is actually clickable
    const isClickable = await button.evaluate((el: any) => el.enabled);
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
