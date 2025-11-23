import { logger } from './logger';
import { databaseService } from './database';

export class ScreenshotLockConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictUserId: string,
    public readonly reason: 'HASH_CONFLICT' | 'UNIQUE_ID_CONFLICT',
  ) {
    super(message);
    this.name = 'ScreenshotLockConflictError';
  }
}

class ScreenshotLockService {
  async verifyLock(params: {
    userId: string;
    screenshotHash: string;
    uniqueId?: string | null;
  }): Promise<void> {
    const { userId, screenshotHash, uniqueId } = params;

    const existingHashLock = await databaseService.findScreenshotLockByHash(screenshotHash);
    if (existingHashLock && existingHashLock.discord_user_id !== userId) {
      throw new ScreenshotLockConflictError(
        'Screenshot hash already linked to another user',
        existingHashLock.discord_user_id,
        'HASH_CONFLICT',
      );
    }

    if (uniqueId) {
      const existingUniqueLock = await databaseService.findScreenshotLockByUniqueId(uniqueId);
      if (existingUniqueLock && existingUniqueLock.discord_user_id !== userId) {
        throw new ScreenshotLockConflictError(
          'OCR unique ID already linked to another user',
          existingUniqueLock.discord_user_id,
          'UNIQUE_ID_CONFLICT',
        );
      }
    }
  }

  async verifyAndUpsert(params: {
    userId: string;
    screenshotHash: string;
    uniqueId?: string | null;
  }): Promise<void> {
    await this.verifyLock(params);
    await this.upsertLock(params);
  }

  async upsertLock(params: {
    userId: string;
    screenshotHash: string;
    uniqueId?: string | null;
  }): Promise<void> {
    await databaseService.upsertScreenshotLock({
      screenshotHash: params.screenshotHash,
      ocrUniqueId: params.uniqueId ?? null,
      discordUserId: params.userId,
    });
  }

  async unlinkByUniqueId(uniqueId: string): Promise<number> {
    const count = await databaseService.deleteScreenshotLockByUniqueId(uniqueId);
    if (count > 0) {
      logger.info('Screenshot lock removed by admin command', {
        unique_id: uniqueId,
        removed_count: count,
      });
    }
    return count;
  }

  async unlinkByHash(hash: string): Promise<number> {
    const count = await databaseService.deleteScreenshotLockByHash(hash);
    if (count > 0) {
      logger.info('Screenshot lock removed by hash override', {
        screenshot_hash: hash,
        removed_count: count,
      });
    }
    return count;
  }
}

export const screenshotLockService = new ScreenshotLockService();









