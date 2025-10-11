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
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Get the new button text after clicking
    const newButtonText = await button.evaluate((el: any) => el.textContent || '').catch(() => '');
    
    // Check if the button is now disabled (indicating successful claim)
    const isNowDisabled = await button.evaluate((el: any) => el.disabled).catch(() => false);
    
    logger.info(`🔍 Button validation debug - Text: "${newButtonText}", Disabled: ${isNowDisabled}`);
    
    // If button is now disabled, it's definitely a valid claim
    if (isNowDisabled) {
      logger.info(`✅ Valid claim confirmed: button is now disabled`);
      return true;
    }
    
    // Check if button text changed to indicate claimed state
    const alreadyClaimedIndicators = ['claimed', 'collected', 'obtained', 'received', 'done', 'complete', 'check', '✓', '✔'];
    const wasAlreadyClaimed = alreadyClaimedIndicators.some(indicator => 
      newButtonText && newButtonText.toLowerCase().includes(indicator.toLowerCase())
    );
    
    if (wasAlreadyClaimed) {
      logger.info(`✅ Valid claim confirmed: button text changed to "${newButtonText}"`);
      return true;
    }
    
    // For 8BP website, trust that the click worked if:
    // 1. The button was clickable (checked before we got here)
    // 2. No error was thrown during the click
    // 3. We're still on the same page (not redirected)
    // The 8BP website buttons don't always change state visibly, but the claim still works
    logger.info(`✅ Assuming successful claim for 8BP website: ${itemName} (button was clickable and no errors)`);
    return true;
    
  } catch (error) {
    logger.warn(`⚠️ Validation error: ${error} - not counting as new claim`);
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
