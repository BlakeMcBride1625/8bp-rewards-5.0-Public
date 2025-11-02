import { logger } from './LoggerService';

type HeartbeatRecord = {
	moduleId: string;
	filePath: string;
	processId: number;
	service?: string;
	lastSeen: number; // epoch ms
};

export class HeartbeatRegistry {
	private static instance: HeartbeatRegistry;
	private records: Map<string, HeartbeatRecord> = new Map();
	private ttlMs: number = parseInt(process.env.HEARTBEAT_TTL_MS || '30000', 10); // 30s default

	private constructor() {}

	public static getInstance(): HeartbeatRegistry {
		if (!HeartbeatRegistry.instance) {
			HeartbeatRegistry.instance = new HeartbeatRegistry();
		}
		return HeartbeatRegistry.instance;
	}

  // Keyed by `${processId}:${filePath}` to ensure uniqueness per process+file
	public report(moduleId: string, filePath: string, processId: number, service?: string): void {
		const key = `${processId}:${filePath}`;
		const now = Date.now();
		this.records.set(key, { moduleId, filePath, processId, service, lastSeen: now });
	}

	public getActiveRecords(): HeartbeatRecord[] {
		const now = Date.now();
		return Array.from(this.records.values()).filter(r => now - r.lastSeen <= this.ttlMs);
	}

	public getSummary() {
		const active = this.getActiveRecords();
		const totalActiveFiles = active.length;
		const byProcess: { [pid: string]: HeartbeatRecord[] } = {};
		for (const rec of active) {
			const key = String(rec.processId);
			if (!byProcess[key]) byProcess[key] = [];
			byProcess[key].push(rec);
		}
		return {
			totalActiveFiles,
			byProcess
		};
	}

	public cleanup(): void {
		const now = Date.now();
		let removed = 0;
		for (const [key, rec] of this.records.entries()) {
			if (now - rec.lastSeen > this.ttlMs) {
				this.records.delete(key);
				removed++;
			}
		}
		if (removed > 0) {
			logger.debug?.('HeartbeatRegistry cleanup removed records', { removed });
		}
	}
}

// Background cleanup interval
const registry = HeartbeatRegistry.getInstance();
setInterval(() => registry.cleanup(), Math.max(10000, parseInt(process.env.HEARTBEAT_CLEAN_INTERVAL_MS || '10000', 10)));




