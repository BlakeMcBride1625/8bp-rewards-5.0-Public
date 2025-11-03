/**
 * Validation utilities
 * Consolidates duplicate validation logic across routes and services
 */

/**
 * Validate eightBallPoolId format (should be numeric)
 * Strict version - requires purely numeric input
 */
export function isValidEightBallPoolId(eightBallPoolId: string): boolean {
  if (!eightBallPoolId || typeof eightBallPoolId !== 'string') {
    return false;
  }
  return /^\d+$/.test(eightBallPoolId);
}

/**
 * Validate user ID format (lenient - removes non-numeric and checks length)
 * Allows IDs with formatting characters, then validates cleaned length
 */
export function isValidIdFormat(uniqueId: string): boolean {
  if (!uniqueId || typeof uniqueId !== 'string') {
    return false;
  }
  
  // Remove any non-numeric characters and check length
  const cleanId = uniqueId.replace(/\D/g, '');
  // Allow 1-15 digits (8 Ball Pool IDs can be very short like "9" or long like "4945905760")
  return cleanId.length >= 1 && cleanId.length <= 15;
}

/**
 * Validate username format and length
 */
export function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false;
  }
  return username.length >= 1 && username.length <= 50;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate 6-digit PIN code format
 */
export function isValid6DigitPin(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }
  return /^\d{6}$/.test(code.trim());
}

/**
 * Validate 16-character hex code (Discord/Telegram codes)
 */
export function isValidHexCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }
  return /^[A-F0-9]{16}$/.test(code.toUpperCase().trim());
}

/**
 * Check if text contains invalid user indicators
 */
export function containsInvalidUserIndicators(text: string, indicators: string[]): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  const lowerText = text.toLowerCase();
  return indicators.some(indicator => lowerText.includes(indicator.toLowerCase()));
}

/**
 * Check if URL contains valid user keywords
 */
export function containsValidUserIndicators(url: string, keywords: string[]): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  const lowerUrl = url.toLowerCase();
  return keywords.some(keyword => lowerUrl.includes(keyword.toLowerCase()));
}

/**
 * Validate registration data
 */
export interface RegistrationData {
  eightBallPoolId: string;
  username: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRegistrationData(data: RegistrationData): ValidationResult {
  const errors: string[] = [];

  if (!data.eightBallPoolId) {
    errors.push('eightBallPoolId is required');
  } else if (!isValidEightBallPoolId(data.eightBallPoolId)) {
    errors.push('eightBallPoolId must be numeric');
  }

  if (!data.username) {
    errors.push('username is required');
  } else if (!isValidUsername(data.username)) {
    errors.push('username must be between 1 and 50 characters');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

