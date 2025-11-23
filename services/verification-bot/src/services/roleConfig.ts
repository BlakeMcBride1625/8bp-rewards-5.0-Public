import fs from 'fs/promises';
import path from 'path';
import { RankConfig } from '../types';
import { logger } from './logger';

type RoleConfigCache = {
  ranks: RankConfig[];
  loadedAt: number;
};

class RoleConfigService {
  private cache: RoleConfigCache | null = null;
  private readonly reloadIntervalMs = 30_000;
  private reloadTimer: NodeJS.Timeout | null = null;
  private readonly configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), 'src', 'config', 'ranks.json');
  }

  /**
   * Validate rank configuration structure.
   */
  private validateConfig(config: unknown): RankConfig[] {
    if (!Array.isArray(config)) {
      throw new Error('Rank configuration must be an array.');
    }

    const validated = config.map((entry, index) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as Record<string, unknown>).role_id !== 'string' ||
        typeof (entry as Record<string, unknown>).rank_name !== 'string' ||
        typeof (entry as Record<string, unknown>).level_min !== 'number' ||
        typeof (entry as Record<string, unknown>).level_max !== 'number'
      ) {
        throw new Error(`Invalid rank configuration entry at index ${index}.`);
      }

      const rank = entry as RankConfig;
      if (rank.level_min > rank.level_max) {
        throw new Error(`Invalid level range for rank "${rank.rank_name}".`);
      }

      return rank;
    });

    return validated;
  }

  /**
   * Load rank configuration from disk.
   */
  private async loadConfigFromDisk(): Promise<RoleConfigCache> {
    const rawJson = await fs.readFile(this.configPath, 'utf-8');
    const parsed = JSON.parse(rawJson) as unknown;
    const ranks = this.validateConfig(parsed);

    logger.info('Rank configuration loaded', {
      rank_count: ranks.length,
    });

    return {
      ranks,
      loadedAt: Date.now(),
    };
  }

  /**
   * Refresh the configuration cache.
   */
  private async refreshConfig(): Promise<void> {
    try {
      this.cache = await this.loadConfigFromDisk();
    } catch (error) {
      logger.error('Failed to load rank configuration', { error });

      if (!this.cache) {
        throw error;
      }
    }
  }

  /**
   * Start automatic reload timer.
   */
  private startAutoReload(): void {
    if (this.reloadTimer) {
      return;
    }

    this.reloadTimer = setInterval(async () => {
      logger.debug('Refreshing role configuration (scheduled)');
      await this.refreshConfig();
    }, this.reloadIntervalMs).unref();
  }

  /**
   * Initialise the service and load the configuration.
   */
  async initialize(): Promise<void> {
    await this.refreshConfig();
    this.startAutoReload();
  }

  /**
   * Manually trigger a reload (e.g. from an admin command).
   */
  async reloadNow(): Promise<void> {
    await this.refreshConfig();
  }

  /**
   * Retrieve the current rank configuration.
   */
  getRanks(): RankConfig[] {
    if (!this.cache) {
      throw new Error('Role configuration not initialised.');
    }

    return this.cache.ranks;
  }

  /**
   * Retrieve the timestamp of the last successful load.
   */
  getLastLoadedAt(): number | null {
    return this.cache?.loadedAt ?? null;
  }

  /**
   * Get a set of configured role IDs.
   */
  getRankRoleIds(): Set<string> {
    return new Set(this.getRanks().map((rank) => rank.role_id));
  }

  /**
   * Gracefully stop auto reload (e.g. during shutdown).
   */
  shutdown(): void {
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
      this.reloadTimer = null;
    }
  }
}

export const roleConfigService = new RoleConfigService();









