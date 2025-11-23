/**
 * Account Portal Sync Service
 * Syncs verification data from bot to rewards system
 */

import { databaseService } from './database';
import { logger } from './logger';
import axios from 'axios';

export interface SyncAccountData {
  discord_id: string;
  username: string;
  unique_id: string;
  level: number;
  rank_name: string;
  avatar_url?: string | null;
  metadata?: Record<string, unknown>;
}

class AccountPortalSyncService {
  private rewardsApiUrl: string;

  constructor() {
    // Get rewards API URL from environment, fallback to internal service URL
    this.rewardsApiUrl = 
      process.env.REWARDS_API_URL || 
      process.env.BACKEND_URL || 
      'http://backend:2600';
    
    // Remove trailing /api if present, we'll add it back
    this.rewardsApiUrl = this.rewardsApiUrl.replace(/\/api\/?$/, '');
    
    logger.info('AccountPortalSyncService initialized', {
      rewards_api_url: this.rewardsApiUrl
    });
  }

  /**
   * Sync account data to rewards system after verification
   */
  async syncAccount(data: SyncAccountData): Promise<void> {
    try {
      // Normalize unique_id - remove dashes for rewards database (stores without dashes)
      const normalizedUniqueId = data.unique_id.replace(/-/g, '');
      
      // Update/create user in verification database
      await databaseService.upsertUser({
        discord_id: data.discord_id,
        username: data.username,
        avatar_url: data.avatar_url,
      });

      // Create/update pool account in verification database (keep original format with dashes for verification DB)
      await databaseService.createPoolAccount({
        owner_discord_id: data.discord_id,
        unique_id: data.unique_id,
        level: data.level,
        rank_name: data.rank_name,
        metadata: data.metadata,
      });

      // Create/update unique link in verification database (keep original format)
      await databaseService.upsertUniqueLink(data.discord_id, data.unique_id);

      // Sync to rewards system via API - use normalized ID (no dashes)
      try {
        const response = await axios.post(
          `${this.rewardsApiUrl}/api/internal/verification/sync`,
          {
            discord_id: data.discord_id,
            username: data.username,
            unique_id: normalizedUniqueId, // Send normalized ID (no dashes) to rewards API
            level: data.level,
            rank_name: data.rank_name,
            avatar_url: data.avatar_url
          },
          {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        logger.info('Account synced to rewards system via API', {
          discord_id: data.discord_id,
          unique_id: data.unique_id,
          level: data.level,
          response_status: response.status
        });
      } catch (apiError: any) {
        // Log error but don't fail verification
        logger.warn('Failed to sync to rewards API (non-blocking)', {
          error: apiError.message,
          discord_id: data.discord_id,
          unique_id: data.unique_id
        });
      }

      logger.info('Account synced to portal', {
        discord_id: data.discord_id,
        unique_id: data.unique_id,
        level: data.level,
      });
    } catch (error) {
      logger.error('Failed to sync account to portal', {
        error,
        discord_id: data.discord_id,
        unique_id: data.unique_id,
      });
      // Don't throw - we don't want to break verification if portal sync fails
    }
  }

  /**
   * Generate profile URL for a Discord user
   * Note: The user dashboard shows accounts for the logged-in user via Discord OAuth,
   * so no query parameters are needed. Users must be logged in to view their dashboard.
   */
  generateProfileUrl(_discordId: string, _uniqueId?: string): string {
    // Use public URL for user-facing links (not internal Docker URLs)
    // PUBLIC_URL already includes /8bp-rewards path, so don't append it again
    const appUrl = process.env.PUBLIC_URL || process.env.APP_URL || 'https://8ballpool.website';
    const baseUrl = appUrl.endsWith('/8bp-rewards') ? appUrl : `${appUrl}/8bp-rewards`;
    // User dashboard shows accounts for the logged-in Discord user, so no query params needed
    return `${baseUrl}/user-dashboard`;
  }
}

export const accountPortalSync = new AccountPortalSyncService();
