import fs from 'fs';
import path from 'path';
import { logger } from './logger';

export interface MetricsSnapshot {
  totalVerifications: number;
  successCount: number;
  failureCount: number;
  manualReviewCount: number;
  averageConfidence: number;
  ocrSampleCount: number;
  dmCleanupCount: number;
  rateLimitHits: number;
  lastUpdated: string;
}

type PersistedMetrics = {
  totalVerifications: number;
  successCount: number;
  failureCount: number;
  manualReviewCount: number;
  confidenceSum: number;
  ocrSampleCount: number;
  dmCleanupCount: number;
  rateLimitHits: number;
  lastUpdated: number;
};

const DEFAULT_METRICS: PersistedMetrics = {
  totalVerifications: 0,
  successCount: 0,
  failureCount: 0,
  manualReviewCount: 0,
  confidenceSum: 0,
  ocrSampleCount: 0,
  dmCleanupCount: 0,
  rateLimitHits: 0,
  lastUpdated: Date.now(),
};

class MetricsService {
  private metrics: PersistedMetrics = { ...DEFAULT_METRICS };
  private readonly filePath: string;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.filePath = path.join(process.cwd(), 'logs', 'metrics.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.ensureDirectory();
        this.persist();
        return;
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedMetrics;
      this.metrics = { ...DEFAULT_METRICS, ...parsed };
    } catch (error) {
      logger.warn('Failed to load metrics from disk, starting fresh', { error });
      this.metrics = { ...DEFAULT_METRICS };
    }
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private schedulePersist(): void {
    if (this.saveTimeout) {
      return;
    }

    this.saveTimeout = setTimeout(() => {
      this.persist();
    }, 2000).unref();
  }

  private persist(): void {
    try {
      this.ensureDirectory();
      fs.writeFileSync(this.filePath, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      logger.warn('Failed to persist metrics to disk', { error });
    } finally {
      this.saveTimeout = null;
    }
  }

  recordVerification(status: 'SUCCESS' | 'FAILURE' | 'MANUAL_REVIEW', confidence?: number): void {
    this.metrics.totalVerifications += 1;
    this.metrics.lastUpdated = Date.now();

    if (status === 'SUCCESS') {
      this.metrics.successCount += 1;
    } else if (status === 'FAILURE') {
      this.metrics.failureCount += 1;
    } else {
      this.metrics.manualReviewCount += 1;
    }

    if (typeof confidence === 'number') {
      this.metrics.confidenceSum += confidence;
      this.metrics.ocrSampleCount += 1;
    }

    this.schedulePersist();
  }

  incrementDmCleanup(count: number = 1): void {
    this.metrics.dmCleanupCount += count;
    this.metrics.lastUpdated = Date.now();
    this.schedulePersist();
  }

  incrementRateLimitHits(count: number = 1): void {
    this.metrics.rateLimitHits += count;
    this.metrics.lastUpdated = Date.now();
    this.schedulePersist();
  }

  getSnapshot(): MetricsSnapshot {
    const averageConfidence =
      this.metrics.ocrSampleCount > 0
        ? this.metrics.confidenceSum / this.metrics.ocrSampleCount
        : 0;

    return {
      totalVerifications: this.metrics.totalVerifications,
      successCount: this.metrics.successCount,
      failureCount: this.metrics.failureCount,
      manualReviewCount: this.metrics.manualReviewCount,
      averageConfidence,
      ocrSampleCount: this.metrics.ocrSampleCount,
      dmCleanupCount: this.metrics.dmCleanupCount,
      rateLimitHits: this.metrics.rateLimitHits,
      lastUpdated: new Date(this.metrics.lastUpdated).toISOString(),
    };
  }
}

export const metricsService = new MetricsService();









