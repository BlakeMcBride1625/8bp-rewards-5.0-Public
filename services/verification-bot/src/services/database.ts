import {
  PrismaClient,
  Verification,
  ScreenshotLock,
  VerificationEvent,
  VerificationStatus,
  Prisma,
} from '@prisma/client';
import { VerificationData, LogEntry } from '../types';
import { logger } from './logger';

class DatabaseService {
  private prisma: PrismaClient | null = null;
  private initializing: Promise<void> | null = null;

  constructor() {
    // Set up database logger callback for logger service
    logger.setDatabaseLogger(this.logToDatabase.bind(this));
  }

  /**
   * Lazily create Prisma client instance
   */
  private createClient(): PrismaClient {
    // Use VERIFICATION_DATABASE_URL if set, otherwise fall back to DATABASE_URL
    const databaseUrl = process.env.VERIFICATION_DATABASE_URL || process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('VERIFICATION_DATABASE_URL or DATABASE_URL environment variable is required');
    }
    
    return new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log: ['error', 'warn'],
    });
  }

  /**
   * Ensure Prisma client is initialised and connected.
   */
  async initialize(retries: number = 3, delayMs: number = 2000): Promise<void> {
    if (this.prisma) {
      return;
    }

    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = (async () => {
      let attempt = 0;

      while (attempt <= retries) {
        try {
          attempt += 1;

          this.prisma = this.createClient();
          await this.prisma.$connect();

          logger.info('Database connected');
          return;
        } catch (error) {
          logger.error('Database connection failed', {
            error,
            attempt,
          });

          if (this.prisma) {
            await this.prisma.$disconnect().catch((disconnectError) => {
              logger.warn('Failed to disconnect prisma client after connection failure', {
                error: disconnectError,
              });
            });
            this.prisma = null;
          }

          if (attempt > retries) {
            throw error;
          }

          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  /**
   * Retrieve active Prisma client instance or throw if not initialised.
   */
  private get client(): PrismaClient {
    if (!this.prisma) {
      throw new Error('Prisma client not initialised. Call databaseService.initialize() first.');
    }

    return this.prisma;
  }

  /**
   * Log entry to database (for logger service callback)
   */
  private async logToDatabase(_entry: LogEntry): Promise<void> {
    // For now, we'll just log to the file. If you want to store logs in a separate table,
    // you can create a Log model in Prisma schema and store them here.
    // This is a placeholder for future database logging if needed.
  }

  /**
   * Upsert verification record (create or update)
   */
  async upsertVerification(data: VerificationData): Promise<Verification> {
    try {
      const verification = await this.client.verification.upsert({
        where: {
          discord_id: data.discord_id,
        },
        update: {
          username: data.username,
          rank_name: data.rank_name,
          level_detected: data.level_detected,
          role_id_assigned: data.role_id_assigned,
          updated_at: new Date(),
        },
        create: {
          discord_id: data.discord_id,
          username: data.username,
          rank_name: data.rank_name,
          level_detected: data.level_detected,
          role_id_assigned: data.role_id_assigned,
        },
      });

      logger.info('Verification upserted', { discord_id: data.discord_id, rank_name: data.rank_name });
      return verification;
    } catch (error) {
      logger.error('Failed to upsert verification', { error, data });
      throw error;
    }
  }

  /**
   * Get verification record by Discord ID
   */
  async getVerification(discordId: string): Promise<Verification | null> {
    try {
      const verification = await this.client.verification.findUnique({
        where: {
          discord_id: discordId,
        },
      });

      return verification;
    } catch (error) {
      logger.error('Failed to get verification', { error, discordId });
      throw error;
    }
  }

  /**
   * Delete verification record
   */
  async deleteVerification(discordId: string): Promise<void> {
    try {
      await this.client.verification.delete({
        where: {
          discord_id: discordId,
        },
      });

      logger.info('Verification deleted', { discord_id: discordId });
    } catch (error) {
      logger.error('Failed to delete verification', { error, discordId });
      throw error;
    }
  }

  /**
   * Get recent verifications
   */
  async getRecentVerifications(limit: number = 10): Promise<Verification[]> {
    try {
      const verifications = await this.client.verification.findMany({
        take: limit,
        orderBy: {
          verified_at: 'desc',
        },
      });

      return verifications;
    } catch (error) {
      logger.error('Failed to get recent verifications', { error, limit });
      throw error;
    }
  }

  /**
   * Purge all verification records (admin only)
   */
  async purgeAllVerifications(): Promise<number> {
    try {
      const result = await this.client.verification.deleteMany({});
      logger.warn('All verifications purged', { count: result.count });
      return result.count;
    } catch (error) {
      logger.error('Failed to purge verifications', { error });
      throw error;
    }
  }

  /**
   * Get Prisma client (for advanced queries if needed)
   */
  getClient(): PrismaClient {
    return this.client;
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (!this.prisma) {
      return;
    }

    await this.prisma.$disconnect();
    this.prisma = null;
    logger.info('Database disconnected');
  }

  /**
   * Find a screenshot lock by hash.
   */
  async findScreenshotLockByHash(hash: string): Promise<ScreenshotLock | null> {
    try {
      return await this.client.screenshotLock.findUnique({
        where: { screenshot_hash: hash },
      });
    } catch (error) {
      logger.error('Failed to find screenshot lock by hash', { error, hash });
      throw error;
    }
  }

  /**
   * Find a screenshot lock by OCR unique ID.
   */
  async findScreenshotLockByUniqueId(ocrId: string): Promise<ScreenshotLock | null> {
    try {
      return await this.client.screenshotLock.findUnique({
        where: { ocr_unique_id: ocrId },
      });
    } catch (error) {
      logger.error('Failed to find screenshot lock by unique id', { error, ocrId });
      throw error;
    }
  }

  /**
   * Create or update screenshot lock entry.
   */
  async upsertScreenshotLock(params: {
    screenshotHash: string;
    ocrUniqueId?: string | null;
    discordUserId: string;
  }): Promise<ScreenshotLock> {
    const { screenshotHash, ocrUniqueId, discordUserId } = params;

    try {
      let lock: ScreenshotLock;

      // First, check if screenshot_hash already exists
      const existingByHash = await this.client.screenshotLock.findUnique({
        where: { screenshot_hash: screenshotHash },
      });

      // If screenshot_hash exists and belongs to the same user, just return it
      if (existingByHash && existingByHash.discord_user_id === discordUserId) {
        // Update ocr_unique_id if provided and different
        if (ocrUniqueId && existingByHash.ocr_unique_id !== ocrUniqueId) {
          lock = await this.client.screenshotLock.update({
            where: { screenshot_hash: screenshotHash },
            data: { ocr_unique_id: ocrUniqueId },
          });
        } else {
          lock = existingByHash;
        }
      } else if (existingByHash && existingByHash.discord_user_id !== discordUserId) {
        // Screenshot hash exists but belongs to different user - this should have been caught by verifyLock
        throw new Error(`Screenshot hash already linked to user ${existingByHash.discord_user_id}`);
      } else if (ocrUniqueId) {
        // Screenshot hash doesn't exist, try to upsert by ocr_unique_id
        // But first check if ocr_unique_id already exists with different screenshot_hash
        const existingByUniqueId = await this.client.screenshotLock.findUnique({
          where: { ocr_unique_id: ocrUniqueId },
        });

        if (existingByUniqueId) {
          // ocr_unique_id exists, update it
          lock = await this.client.screenshotLock.update({
            where: { ocr_unique_id: ocrUniqueId },
            data: {
              screenshot_hash: screenshotHash,
              discord_user_id: discordUserId,
            },
          });
        } else {
          // Neither exists, create new
          lock = await this.client.screenshotLock.create({
            data: {
              screenshot_hash: screenshotHash,
              ocr_unique_id: ocrUniqueId,
              discord_user_id: discordUserId,
            },
          });
        }
      } else {
        // No ocr_unique_id, screenshot_hash doesn't exist, create new
        lock = await this.client.screenshotLock.create({
          data: {
            screenshot_hash: screenshotHash,
            discord_user_id: discordUserId,
          },
        });
      }

      logger.info('Screenshot lock upserted', {
        screenshot_hash: screenshotHash,
        ocr_unique_id: ocrUniqueId,
        discord_user_id: discordUserId,
      });

      return lock;
    } catch (error) {
      logger.error('Failed to upsert screenshot lock', {
        error,
        screenshot_hash: screenshotHash,
        ocr_unique_id: ocrUniqueId,
        discord_user_id: discordUserId,
      });
      throw error;
    }
  }

  /**
   * Delete a screenshot lock by OCR ID.
   */
  async deleteScreenshotLockByUniqueId(ocrId: string): Promise<number> {
    try {
      const result = await this.client.screenshotLock.deleteMany({
        where: {
          ocr_unique_id: ocrId,
        },
      });

      logger.info('Screenshot lock removed', {
        ocr_unique_id: ocrId,
        deleted_count: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to delete screenshot lock', { error, ocrId });
      throw error;
    }
  }

  /**
   * Delete screenshot locks by hash (utility for overrides).
   */
  async deleteScreenshotLockByHash(hash: string): Promise<number> {
    try {
      const result = await this.client.screenshotLock.deleteMany({
        where: {
          screenshot_hash: hash,
        },
      });

      logger.info('Screenshot lock removed by hash', {
        screenshot_hash: hash,
        deleted_count: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to delete screenshot lock by hash', { error, hash });
      throw error;
    }
  }

  /**
   * Record verification event.
   */
  async createVerificationEvent(data: {
    discordUserId: string;
    status: VerificationStatus;
    confidence?: number | null;
    ocrUniqueId?: string | null;
    screenshotHash?: string | null;
    messageId?: string | null;
    attachmentUrl?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<VerificationEvent> {
    try {
      const event = await this.client.verificationEvent.create({
        data: {
          discord_user_id: data.discordUserId,
          status: data.status,
          confidence: data.confidence ?? null,
          ocr_unique_id: data.ocrUniqueId ?? null,
          screenshot_hash: data.screenshotHash ?? null,
          message_id: data.messageId ?? null,
          attachment_url: data.attachmentUrl ?? null,
          metadata: (data.metadata as Prisma.InputJsonValue) ?? {},
        },
      });

      logger.info('Verification event recorded', {
        discord_user_id: data.discordUserId,
        status: data.status,
      });

      return event;
    } catch (error) {
      logger.error('Failed to record verification event', { error, data });
      throw error;
    }
  }

  /**
   * Get all accounts for a Discord user
   */
  async getUserAccounts(discordId: string): Promise<Array<{
    id: string;
    owner_discord_id: string;
    unique_id: string;
    level: number;
    rank_name: string;
    verified_at: Date;
    is_primary: boolean;
    metadata: Prisma.InputJsonValue | null;
    created_at: Date;
    updated_at: Date;
  }>> {
    try {
      const accounts = await this.client.poolAccount.findMany({
        where: { owner_discord_id: discordId },
        orderBy: [
          { is_primary: 'desc' },
          { level: 'desc' },
        ],
      });
      return accounts;
    } catch (error) {
      logger.error('Failed to get user accounts', { error, discordId });
      throw error;
    }
  }

  /**
   * Create or update a pool account
   */
  async createPoolAccount(data: {
    owner_discord_id: string;
    unique_id: string;
    level: number;
    rank_name: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<{
    id: string;
    owner_discord_id: string;
    unique_id: string;
    level: number;
    rank_name: string;
    verified_at: Date;
    is_primary: boolean;
    metadata: Prisma.InputJsonValue | null;
    created_at: Date;
    updated_at: Date;
  }> {
    try {
      const account = await this.client.poolAccount.upsert({
        where: {
          owner_discord_id_unique_id: {
            owner_discord_id: data.owner_discord_id,
            unique_id: data.unique_id,
          },
        },
        update: {
          level: data.level,
          rank_name: data.rank_name,
          metadata: data.metadata as Prisma.InputJsonValue ?? null,
          updated_at: new Date(),
        },
        create: {
          owner_discord_id: data.owner_discord_id,
          unique_id: data.unique_id,
          level: data.level,
          rank_name: data.rank_name,
          metadata: data.metadata as Prisma.InputJsonValue ?? null,
        },
      });

      logger.info('Pool account created/updated', {
        discord_id: data.owner_discord_id,
        unique_id: data.unique_id,
      });

      return account;
    } catch (error) {
      logger.error('Failed to create pool account', { error, data });
      throw error;
    }
  }

  /**
   * Delete a pool account (owner-only)
   */
  async deletePoolAccount(accountId: string, ownerDiscordId: string): Promise<boolean> {
    try {
      const result = await this.client.poolAccount.deleteMany({
        where: {
          id: accountId,
          owner_discord_id: ownerDiscordId,
        },
      });

      if (result.count > 0) {
        logger.info('Pool account deleted', { accountId, ownerDiscordId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to delete pool account', { error, accountId, ownerDiscordId });
      throw error;
    }
  }

  /**
   * Set primary account (ensures only one primary per user)
   */
  async setPrimaryAccount(discordId: string, accountId: string): Promise<void> {
    try {
      // First, unset all primary flags for this user
      await this.client.poolAccount.updateMany({
        where: {
          owner_discord_id: discordId,
          is_primary: true,
        },
        data: {
          is_primary: false,
        },
      });

      // Then set the specified account as primary
      await this.client.poolAccount.update({
        where: {
          id: accountId,
          owner_discord_id: discordId,
        },
        data: {
          is_primary: true,
        },
      });

      logger.info('Primary account set', { discordId, accountId });
    } catch (error) {
      logger.error('Failed to set primary account', { error, discordId, accountId });
      throw error;
    }
  }

  /**
   * Get leaderboard sorted by highest level
   */
  async getLeaderboard(limit: number = 50, sortBy: 'level' | 'total_accounts' = 'level'): Promise<Array<{
    rank: number;
    discord_id: string;
    username: string | null;
    avatar_url: string | null;
    highest_level: number | null;
    total_accounts: number;
  }>> {
    try {
      if (sortBy === 'level') {
        // Get users sorted by their highest level account
        const leaderboard = await this.client.$queryRaw<Array<{
          discord_id: string;
          username: string | null;
          avatar_url: string | null;
          highest_level: bigint;
          total_accounts: bigint;
        }>>`
          SELECT 
            u.discord_id,
            u.username,
            u.avatar_url,
            MAX(pa.level) as highest_level,
            COUNT(pa.id) as total_accounts
          FROM users u
          LEFT JOIN pool_accounts pa ON u.discord_id = pa.owner_discord_id
          GROUP BY u.discord_id, u.username, u.avatar_url
          HAVING MAX(pa.level) IS NOT NULL
          ORDER BY MAX(pa.level) DESC
          LIMIT ${limit}
        `;

        return leaderboard.map((entry, index) => ({
          rank: index + 1,
          discord_id: entry.discord_id,
          username: entry.username,
          avatar_url: entry.avatar_url,
          highest_level: Number(entry.highest_level),
          total_accounts: Number(entry.total_accounts),
        }));
      } else {
        // Sort by total accounts
        const leaderboard = await this.client.$queryRaw<Array<{
          discord_id: string;
          username: string | null;
          avatar_url: string | null;
          highest_level: bigint;
          total_accounts: bigint;
        }>>`
          SELECT 
            u.discord_id,
            u.username,
            u.avatar_url,
            MAX(pa.level) as highest_level,
            COUNT(pa.id) as total_accounts
          FROM users u
          LEFT JOIN pool_accounts pa ON u.discord_id = pa.owner_discord_id
          GROUP BY u.discord_id, u.username, u.avatar_url
          HAVING COUNT(pa.id) > 0
          ORDER BY COUNT(pa.id) DESC, MAX(pa.level) DESC
          LIMIT ${limit}
        `;

        return leaderboard.map((entry, index) => ({
          rank: index + 1,
          discord_id: entry.discord_id,
          username: entry.username,
          avatar_url: entry.avatar_url,
          highest_level: Number(entry.highest_level),
          total_accounts: Number(entry.total_accounts),
        }));
      }
    } catch (error) {
      logger.error('Failed to get leaderboard', { error, limit, sortBy });
      throw error;
    }
  }

  /**
   * Check if user is blocked
   */
  async isUserBlocked(discordId: string): Promise<boolean> {
    try {
      const blocked = await this.client.blockedUser.findUnique({
        where: { discord_id: discordId },
      });
      return blocked !== null;
    } catch (error) {
      logger.error('Failed to check if user is blocked', { error, discordId });
      throw error;
    }
  }

  /**
   * Block a user
   */
  async blockUser(discordId: string, reason: string | null, adminDiscordId: string): Promise<void> {
    try {
      await this.client.blockedUser.upsert({
        where: { discord_id: discordId },
        update: {
          reason: reason ?? null,
          blocked_by: adminDiscordId,
          blocked_at: new Date(),
        },
        create: {
          discord_id: discordId,
          reason: reason ?? null,
          blocked_by: adminDiscordId,
        },
      });

      logger.info('User blocked', { discordId, reason, adminDiscordId });
    } catch (error) {
      logger.error('Failed to block user', { error, discordId, reason, adminDiscordId });
      throw error;
    }
  }

  /**
   * Unblock a user
   */
  async unblockUser(discordId: string): Promise<boolean> {
    try {
      const result = await this.client.blockedUser.deleteMany({
        where: { discord_id: discordId },
      });

      if (result.count > 0) {
        logger.info('User unblocked', { discordId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to unblock user', { error, discordId });
      throw error;
    }
  }

  /**
   * Upsert user (create or update Discord user info)
   */
  async upsertUser(data: {
    discord_id: string;
    username: string;
    avatar_url?: string | null;
  }): Promise<{
    discord_id: string;
    username: string;
    avatar_url: string | null;
    created_at: Date;
    updated_at: Date;
  }> {
    try {
      const user = await this.client.user.upsert({
        where: { discord_id: data.discord_id },
        update: {
          username: data.username,
          avatar_url: data.avatar_url ?? null,
          updated_at: new Date(),
        },
        create: {
          discord_id: data.discord_id,
          username: data.username,
          avatar_url: data.avatar_url ?? null,
        },
      });

      return user;
    } catch (error) {
      logger.error('Failed to upsert user', { error, data });
      throw error;
    }
  }

  /**
   * Create or update unique link
   */
  async upsertUniqueLink(discordId: string, uniqueId: string): Promise<void> {
    try {
      await this.client.uniqueLink.upsert({
        where: { unique_id: uniqueId },
        update: {
          discord_id: discordId,
        },
        create: {
          discord_id: discordId,
          unique_id: uniqueId,
        },
      });

      logger.debug('Unique link upserted', { discordId, uniqueId });
    } catch (error) {
      logger.error('Failed to upsert unique link', { error, discordId, uniqueId });
      throw error;
    }
  }

  /**
   * Get user profile data with all accounts
   */
  async getUserProfile(discordId: string): Promise<{
    user: {
      discord_id: string;
      username: string;
      avatar_url: string | null;
      created_at: Date;
    } | null;
    accounts: Array<{
      id: string;
      unique_id: string;
      level: number;
      rank_name: string;
      verified_at: Date;
      is_primary: boolean;
      created_at: Date;
    }>;
  }> {
    try {
      const user = await this.client.user.findUnique({
        where: { discord_id: discordId },
        select: {
          discord_id: true,
          username: true,
          avatar_url: true,
          created_at: true,
        },
      });

      const accounts = await this.client.poolAccount.findMany({
        where: { owner_discord_id: discordId },
        select: {
          id: true,
          unique_id: true,
          level: true,
          rank_name: true,
          verified_at: true,
          is_primary: true,
          created_at: true,
        },
        orderBy: [
          { is_primary: 'desc' },
          { level: 'desc' },
        ],
      });

      return {
        user,
        accounts,
      };
    } catch (error) {
      logger.error('Failed to get user profile', { error, discordId });
      throw error;
    }
  }
}

export const databaseService = new DatabaseService();

