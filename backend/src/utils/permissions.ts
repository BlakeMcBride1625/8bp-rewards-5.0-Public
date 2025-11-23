/**
 * Permission checking utilities
 * Consolidates duplicate permission validation logic across routes
 */

/**
 * Check if a Discord user ID is allowed for VPS access
 */
export function isAllowedForVPS(userId: string): boolean {
  const allowedAdmins = process.env.ALLOWED_VPS_ADMINS?.split(',').map(id => id.trim()) || [];
  return allowedAdmins.includes(userId);
}

/**
 * Check if a Discord user ID is allowed for Telegram access
 */
export function isAllowedForTelegram(discordUserId: string): boolean {
  const allowedVpsAdmins = process.env.ALLOWED_VPS_ADMINS?.split(',').map(id => id.trim()) || [];
  return allowedVpsAdmins.includes(discordUserId);
}

/**
 * Check if an email address is allowed for email authentication
 */
export function isAllowedForEmail(userEmail: string): boolean {
  if (!userEmail) return false;
  
  const allowedEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim().toLowerCase()) || [];
  if (allowedEmails.length === 0) return false; // No emails configured
  
  return allowedEmails.includes(userEmail.toLowerCase());
}

/**
 * Check if a Discord user ID is in the VPS owners list
 */
export function isVPSOwner(userId: string): boolean {
  const vpsOwners = process.env.VPS_OWNERS?.split(',').map(id => id.trim()) || [];
  return vpsOwners.includes(userId);
}

/**
 * Check if a Discord user ID is in the allowed admins list
 */
export function isAllowedAdmin(userId: string): boolean {
  const allowedAdmins = process.env.ALLOWED_ADMINS?.split(',').map(id => id.trim()) || [];
  return allowedAdmins.includes(userId);
}





