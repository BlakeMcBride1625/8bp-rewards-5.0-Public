import { Pool } from 'pg';
import { logger } from './LoggerService';

// Import PostgreSQL models - use absolute path from project root
import path from 'path';
// When compiled: __dirname = dist/backend/backend/src/services
// Go up 5 levels to reach project root: dist/backend/backend/src/services -> dist/backend/backend/src -> dist/backend/backend -> dist/backend -> dist -> (project root)
const projectRoot = path.resolve(__dirname, '../../../../..');
const modelsPath = path.join(projectRoot, 'models/postgresql/Registration');
const postgresModels = require(modelsPath);
const PostgresRegistration = postgresModels.Registration || postgresModels.default?.Registration;
const PostgresClaimRecord = postgresModels.ClaimRecord || postgresModels.default?.ClaimRecord;

export class DatabaseService {
  private static instance: DatabaseService;
  private postgresPool: Pool | null = null;
  private isPostgresMode: boolean = false;
  private isConnected: boolean = false;

  private constructor() {
    this.isPostgresMode = true; // Always use PostgreSQL
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async connect(): Promise<boolean> {
    try {
      if (this.isConnected) {
        logger.info('📊 Database already connected');
        return true;
      }

      await this.connectPostgreSQL();

      this.isConnected = true;
      return true;
    } catch (error) {
      logger.error('❌ Database connection error:', { error: error instanceof Error ? error.message : 'Unknown error' });
      this.isConnected = false;
      return false;
    }
  }

  private async connectPostgreSQL(): Promise<void> {
    logger.info('🔗 Connecting to PostgreSQL...', {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || '5432',
      database: process.env.POSTGRES_DB || '8bp_rewards',
      user: process.env.POSTGRES_USER || 'admin'
    });
    
    // Connect to host PostgreSQL (no Docker-specific logic)
    // Optimized pool configuration based on typical web application patterns
    this.postgresPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || '8bp_rewards',
      user: process.env.POSTGRES_USER || 'admin',
      password: process.env.POSTGRES_PASSWORD,
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
      // Connection pool settings - aggressively reduced to prevent connection exhaustion
      max: parseInt(process.env.POSTGRES_POOL_MAX || '5'), // Maximum number of clients in the pool (reduced from 10)
      min: parseInt(process.env.POSTGRES_POOL_MIN || '1'),   // Minimum number of clients to maintain (reduced from 2)
      // Connection lifecycle
      idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000'), // Close idle clients after 30s
      connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '20000'), // Wait 20s for connection
      // Query settings
      query_timeout: parseInt(process.env.POSTGRES_QUERY_TIMEOUT || '30000'), // Query timeout 30s
      // Keep-alive settings to prevent connection drops
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000, // Start sending keep-alive after 10s
    });

    // Test connection with retry
    let connected = false;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
    const client = await this.postgresPool.connect();
    await client.query('SELECT NOW()');
    client.release();
        connected = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`PostgreSQL connection attempt ${attempt} failed:`, {
          error: lastError.message,
          code: (error as any)?.code
        });
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    if (!connected) {
      throw lastError || new Error('Failed to connect to PostgreSQL after 3 attempts');
    }
    
    logger.info('✅ Connected to PostgreSQL successfully');
  }


  public async disconnect(): Promise<void> {
    if (this.postgresPool) {
      await this.postgresPool.end();
      logger.info('🔌 Disconnected from PostgreSQL');
    }
    this.isConnected = false;
  }

  public async healthCheck(): Promise<{ connected: boolean; userCount: number; timestamp: string; error?: string }> {
    try {
      await this.ensureConnection();
      
      const result = await this.postgresPool!.query('SELECT COUNT(*) FROM registrations');
      const userCount = parseInt(result.rows[0].count);
      return {
        connected: this.isConnected,
        userCount,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        userCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  private async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  // Convert MongoDB-style queries to PostgreSQL-compatible queries
  private convertMongoQueryToPostgres(query: any): any {
    if (!query || typeof query !== 'object') {
      return query;
    }

    const pgQuery: any = {};

    for (const [key, value] of Object.entries(query)) {
      if (key === 'createdAt' && value && typeof value === 'object') {
        // Handle MongoDB date operators like { $gte: date }
        if ('$gte' in value) {
          pgQuery.createdAt = { $gte: value.$gte };
        } else if ('$lte' in value) {
          pgQuery.createdAt = { $lte: value.$lte };
        } else {
          pgQuery[key] = value;
        }
      } else if (key === 'claimedAt' && value && typeof value === 'object') {
        // Handle MongoDB date operators for claim records
        if ('$gte' in value) {
          pgQuery.claimedAt = { $gte: value.$gte };
        } else if ('$lte' in value) {
          pgQuery.claimedAt = { $lte: value.$lte };
        } else {
          pgQuery[key] = value;
        }
      } else {
        pgQuery[key] = value;
      }
    }

    return pgQuery;
  }

  // Registration methods
  public async findRegistration(query: any): Promise<any> {
    // Convert MongoDB-style query to PostgreSQL
    const pgQuery = this.convertMongoQueryToPostgres(query);
    return await PostgresRegistration.findOne(pgQuery);
  }

  public async findRegistrations(query: any = {}): Promise<any[]> {
    // Convert MongoDB-style query to PostgreSQL
    const pgQuery = this.convertMongoQueryToPostgres(query);
    return await PostgresRegistration.find(pgQuery);
  }

  public async createRegistration(data: any): Promise<any> {
    const registration = new PostgresRegistration(data);
    return await registration.save();
  }

  public async updateRegistration(eightBallPoolId: string, data: any): Promise<any> {
    const registration = await PostgresRegistration.findOne({ eightBallPoolId });
    if (!registration) return null;
    
    // Only update fields that are provided in data (partial update)
    // This prevents resetting fields that aren't being updated
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        (registration as any)[key] = data[key];
      }
    });
    
    return await registration.save();
  }

  public async deleteRegistration(eightBallPoolId: string): Promise<void> {
    const registration = await PostgresRegistration.findOne({ eightBallPoolId });
    if (registration) {
      await registration.delete();
    }
  }

  // Claim Record methods
  public async findClaimRecord(query: any): Promise<any> {
    // Convert MongoDB-style query to PostgreSQL
    const pgQuery = this.convertMongoQueryToPostgres(query);
    return await PostgresClaimRecord.findOne(pgQuery);
  }

  public async findClaimRecords(query: any = {}): Promise<any[]> {
    // Convert MongoDB-style query to PostgreSQL
    const pgQuery = this.convertMongoQueryToPostgres(query);
    return await PostgresClaimRecord.find(pgQuery);
  }

  public async createClaimRecord(data: any): Promise<any> {
    const claimRecord = new PostgresClaimRecord(data);
    return await claimRecord.save();
  }

  public async updateClaimRecord(id: string, data: any): Promise<any> {
    const claimRecord = await PostgresClaimRecord.findOne({ id });
    if (!claimRecord) return null;
    
    Object.assign(claimRecord, data);
    return await claimRecord.save();
  }

  public async deleteClaimRecord(id: string): Promise<void> {
    const claimRecord = await PostgresClaimRecord.findOne({ id });
    if (claimRecord) {
      await claimRecord.delete();
    }
  }

  public async deleteAllClaimRecords(): Promise<number> {
    const result = await PostgresClaimRecord.deleteAll();
    return result;
  }

  // Analytics methods
  public async getClaimStats(days?: number): Promise<any[]> {
    return await PostgresClaimRecord.getClaimStats(days);
  }

  public async getUserClaimTotals(eightBallPoolId: string, days: number = 7): Promise<any[]> {
    return await PostgresClaimRecord.getUserClaimTotals(eightBallPoolId, days);
  }

  // Utility methods
  public async executeQuery(query: string, params: any[] = []): Promise<any> {
    if (!this.postgresPool) {
      throw new Error('PostgreSQL is not active');
    }
    
    const client = await this.postgresPool.connect();
    try {
      const result = await client.query(query, params);
      return result;
    } finally {
      client.release();
    }
  }

  public isUsingPostgreSQL(): boolean {
    return true;
  }

  public isUsingMongoDB(): boolean {
    return false;
  }

  public getDatabaseType(): string {
    return 'postgresql';
  }

  public isConnectedToDatabase(): boolean {
    return this.isConnected;
  }

  public getConnectionString(): string {
    return `postgresql://${process.env.POSTGRES_USER}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`;
  }

  public async deleteClaimRecords(filter: any): Promise<number> {
    const result = await PostgresClaimRecord.deleteMany(filter);
    return result;
  }

  public async cleanupFailedClaims(): Promise<{
    removedClaimRecords: number;
    removedLogEntries: number;
    removedValidationLogs: number;
  }> {
    await this.ensureConnection();
    if (!this.postgresPool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    const client = await this.postgresPool.connect();
    let claimResultCount = 0;
    let logResultCount = 0;
    let validationResultCount = 0;

    try {
      await client.query('BEGIN');

      const claimResult = await client.query(
        `DELETE FROM claim_records WHERE status = 'failed'`
      );
      claimResultCount = claimResult.rowCount ?? 0;

      const logResult = await client.query(
        `
          DELETE FROM log_entries
          WHERE metadata->>'action' IN ('claim_failed', 'failed_claim')
             OR (
               metadata->>'action' = 'claim'
               AND metadata->>'success' = 'false'
             )
        `
      );
      logResultCount = logResult.rowCount ?? 0;

      try {
        const validationResult = await client.query(
          `
            DELETE FROM validation_logs
            WHERE source_module IN ('claimer', 'scheduler', 'first-time-claim')
              AND (
                validation_result->>'isValid' = 'false'
                OR validation_result->>'status' = 'failed'
              )
          `
        );
        validationResultCount = validationResult.rowCount ?? 0;
      } catch (validationError) {
        logger.warn('Validation logs cleanup skipped', {
          action: 'cleanup_failed_claims_validation_logs_error',
          error: validationError instanceof Error ? validationError.message : 'Unknown error'
        });
      }

      await client.query('COMMIT');

      logger.info('🧹 Failed claims cleanup complete', {
        action: 'cleanup_failed_claims_success',
        removedClaimRecords: claimResultCount,
        removedLogEntries: logResultCount,
        removedValidationLogs: validationResultCount
      });

      return {
        removedClaimRecords: claimResultCount,
        removedLogEntries: logResultCount,
        removedValidationLogs: validationResultCount
      };
    } catch (error) {
      await client.query('ROLLBACK');

      logger.error('❌ Failed to cleanup failed claims', {
        action: 'cleanup_failed_claims_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    } finally {
      client.release();
    }
  }

  // Validation and deregistration methods
  
  /**
   * Create invalid user record
   */
  public async createInvalidUserRecord(invalidUserData: any): Promise<any> {
    if (!this.isConnected || !this.postgresPool) {
      throw new Error('Database not connected');
    }

    try {
      const query = `
        INSERT INTO invalid_users (
          eight_ball_pool_id, 
          deregistration_reason, 
          source_module, 
          error_message, 
          correlation_id, 
          deregistered_at, 
          context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const values = [
        invalidUserData.eightBallPoolId,
        invalidUserData.deregistrationReason || 'unknown',
        invalidUserData.sourceModule || 'unknown',
        invalidUserData.errorMessage || 'No error message provided',
        invalidUserData.correlationId || 'no_correlation_id',
        invalidUserData.deregisteredAt || new Date().toISOString(),
        JSON.stringify(invalidUserData.context || {})
      ];
      
      const result = await this.executeQuery(query, values);
      logger.info(`📝 Invalid user record created: ${invalidUserData.eightBallPoolId}`);
      return result.rows[0];
      
    } catch (error) {
      logger.error('❌ Failed to create invalid user record:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get all invalid users
   */
  public async findInvalidUsers(): Promise<any[]> {
    if (!this.isConnected || !this.postgresPool) {
      throw new Error('Database not connected');
    }

    try {
      const query = `
        SELECT 
          eight_ball_pool_id,
          deregistration_reason,
          source_module,
          error_message,
          correlation_id,
          deregistered_at,
          context
        FROM invalid_users 
        ORDER BY deregistered_at DESC
      `;
      
      const result = await this.executeQuery(query);
      return result.rows;
      
    } catch (error) {
      logger.error('❌ Failed to fetch invalid users:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Create validation log entry
   */
  public async createValidationLog(logData: any): Promise<any> {
    if (!this.isConnected || !this.postgresPool) {
      throw new Error('Database not connected');
    }

    try {
      const query = `
        INSERT INTO validation_logs (
          unique_id,
          source_module,
          validation_result,
          context,
          timestamp,
          correlation_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      
      const values = [
        logData.uniqueId,
        logData.sourceModule,
        JSON.stringify(logData.validationResult),
        JSON.stringify(logData.context),
        logData.timestamp,
        logData.correlationId
      ];
      
      const result = await this.executeQuery(query, values);
      return result.rows[0];
      
    } catch (error) {
      logger.error('❌ Failed to create validation log:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get validation logs with filtering
   */
  public async getValidationLogs(filters: any = {}): Promise<any[]> {
    if (!this.isConnected || !this.postgresPool) {
      throw new Error('Database not connected');
    }

    try {
      let query = `
        SELECT 
          unique_id,
          source_module,
          validation_result,
          context,
          timestamp,
          correlation_id
        FROM validation_logs
        WHERE 1=1
      `;
      
      const values: any[] = [];
      let paramCount = 0;
      
      if (filters.uniqueId) {
        paramCount++;
        query += ` AND unique_id = $${paramCount}`;
        values.push(filters.uniqueId);
      }
      
      if (filters.sourceModule) {
        paramCount++;
        query += ` AND source_module = $${paramCount}`;
        values.push(filters.sourceModule);
      }
      
      if (filters.startDate) {
        paramCount++;
        query += ` AND timestamp >= $${paramCount}`;
        values.push(filters.startDate);
      }
      
      if (filters.endDate) {
        paramCount++;
        query += ` AND timestamp <= $${paramCount}`;
        values.push(filters.endDate);
      }
      
      query += ` ORDER BY timestamp DESC`;
      
      if (filters.limit) {
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        values.push(filters.limit);
      }
      
      const result = await this.executeQuery(query, values);
      return result.rows;
      
    } catch (error) {
      logger.error('❌ Failed to fetch validation logs:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get system health metrics
   */
  public async getSystemHealthMetrics(): Promise<any> {
    if (!this.isConnected || !this.postgresPool) {
      throw new Error('Database not connected');
    }

    try {
      const queries = {
        totalUsers: 'SELECT COUNT(*) as count FROM registrations',
        activeUsers: 'SELECT COUNT(*) as count FROM registrations WHERE status = \'active\'',
        invalidUsers: 'SELECT COUNT(*) as count FROM invalid_users',
        recentValidations: `
          SELECT COUNT(*) as count 
          FROM validation_logs 
          WHERE timestamp >= NOW() - INTERVAL '1 hour'
        `,
        validationFailures: `
          SELECT COUNT(*) as count 
          FROM validation_logs 
          WHERE timestamp >= NOW() - INTERVAL '1 hour'
          AND validation_result->>'isValid' = 'false'
        `,
        moduleStats: `
          SELECT 
            source_module,
            COUNT(*) as total_attempts,
            COUNT(CASE WHEN validation_result->>'isValid' = 'true' THEN 1 END) as successes,
            COUNT(CASE WHEN validation_result->>'isValid' = 'false' THEN 1 END) as failures
          FROM validation_logs 
          WHERE timestamp >= NOW() - INTERVAL '24 hours'
          GROUP BY source_module
        `
      };
      
      const results: any = {};
      
      for (const [key, query] of Object.entries(queries)) {
        try {
          const result = await this.executeQuery(query);
          if (key === 'moduleStats') {
            results[key] = result.rows;
          } else {
            results[key] = parseInt(result.rows[0].count);
          }
        } catch (error) {
          logger.error(`❌ Failed to fetch ${key}:`, { error: error instanceof Error ? error.message : 'Unknown error' });
          results[key] = null;
        }
      }
      
      return results;
      
    } catch (error) {
      logger.error('❌ Failed to fetch system health metrics:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Cleanup old validation logs
   */
  public async cleanupValidationLogs(daysToKeep: number = 30): Promise<number> {
    if (!this.isConnected || !this.postgresPool) {
      throw new Error('Database not connected');
    }

    try {
      const query = `
        DELETE FROM validation_logs 
        WHERE timestamp < NOW() - INTERVAL '${daysToKeep} days'
      `;
      
      const result = await this.executeQuery(query);
      logger.info(`🧹 Cleaned up ${result.rowCount} old validation logs`);
      return result.rowCount;
      
    } catch (error) {
      logger.error('❌ Failed to cleanup validation logs:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get all users (for validation)
   */
  public async getAllUsers(): Promise<any[]> {
    try {
      const registrations = await PostgresRegistration.find({});
      return registrations.map((reg: any) => ({
        eightBallPoolId: reg.eightBallPoolId,
        username: reg.username,
        status: reg.status || 'active'
      }));
    } catch (error) {
      logger.error('❌ Failed to get all users:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Remove user by 8BP ID
   */
  public async removeUserByEightBallPoolId(eightBallPoolId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const registrations = await PostgresRegistration.find({ eightBallPoolId });
      if (registrations.length === 0) {
        return { success: false, error: 'User not found' };
      }
      
      // Delete all matching registrations
      let deletedCount = 0;
      for (const registration of registrations) {
        await registration.delete();
        deletedCount++;
      }
      
      if (deletedCount > 0) {
        return { success: true };
      } else {
        return { success: false, error: 'User not found' };
      }
    } catch (error) {
      logger.error('❌ Failed to remove user:', { error: error instanceof Error ? error.message : 'Unknown error' });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ==================== VPS Codes Storage ====================
  
  /**
   * Store VPS code for a user
   */
  async storeVPSCode(data: {
    userId: string;
    discordCode: string;
    telegramCode: string;
    emailCode: string;
    userEmail?: string;
    username: string;
    expiresAt: Date;
    discordMessageId?: string;
    telegramMessageId?: string;
  }): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query(
        `INSERT INTO vps_codes (user_id, discord_code, telegram_code, email_code, user_email, username, expires_at, discord_message_id, telegram_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           discord_code = EXCLUDED.discord_code,
           telegram_code = EXCLUDED.telegram_code,
           email_code = EXCLUDED.email_code,
           user_email = EXCLUDED.user_email,
           username = EXCLUDED.username,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           is_used = FALSE,
           discord_message_id = EXCLUDED.discord_message_id,
           telegram_message_id = EXCLUDED.telegram_message_id,
           updated_at = CURRENT_TIMESTAMP`,
        [
          data.userId,
          data.discordCode,
          data.telegramCode,
          data.emailCode,
          data.userEmail || null,
          data.username,
          data.expiresAt,
          data.discordMessageId || null,
          data.telegramMessageId || null
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get VPS code for a user
   */
  async getVPSCode(userId: string): Promise<{
    discordCode: string;
    telegramCode: string;
    emailCode: string;
    userEmail?: string;
    username: string;
    expiresAt: Date;
    attempts: number;
    isUsed: boolean;
    discordMessageId?: string;
    telegramMessageId?: string;
  } | null> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM vps_codes WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        discordCode: row.discord_code,
        telegramCode: row.telegram_code,
        emailCode: row.email_code,
        userEmail: row.user_email,
        username: row.username,
        expiresAt: row.expires_at,
        attempts: row.attempts,
        isUsed: row.is_used,
        discordMessageId: row.discord_message_id,
        telegramMessageId: row.telegram_message_id
      };
    } finally {
      client.release();
    }
  }

  /**
   * Increment attempts for VPS code
   */
  async incrementVPSCodeAttempts(userId: string): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query(
        'UPDATE vps_codes SET attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
        [userId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Mark VPS code as used
   */
  async markVPSCodeAsUsed(userId: string): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query(
        'UPDATE vps_codes SET is_used = TRUE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
        [userId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Delete VPS code
   */
  async deleteVPSCode(userId: string): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query('DELETE FROM vps_codes WHERE user_id = $1', [userId]);
    } finally {
      client.release();
    }
  }

  /**
   * Store VPS access grant
   */
  async storeVPSAccess(data: {
    userId: string;
    expiresAt: Date;
  }): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query(
        `INSERT INTO vps_access (user_id, expires_at)
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           granted_at = CURRENT_TIMESTAMP,
           expires_at = EXCLUDED.expires_at`,
        [data.userId, data.expiresAt]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get VPS access for a user
   */
  async getVPSAccess(userId: string): Promise<{
    grantedAt: Date;
    expiresAt: Date;
  } | null> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM vps_access WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        grantedAt: row.granted_at,
        expiresAt: row.expires_at
      };
    } finally {
      client.release();
    }
  }

  /**
   * Delete VPS access
   */
  async deleteVPSAccess(userId: string): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query('DELETE FROM vps_access WHERE user_id = $1', [userId]);
    } finally {
      client.release();
    }
  }

  // ==================== Reset Leaderboard Codes Storage ====================
  
  /**
   * Store reset leaderboard code for a user
   */
  async storeResetLeaderboardCode(data: {
    userId: string;
    discordCode: string;
    telegramCode: string;
    emailCode: string;
    userEmail?: string;
    username: string;
    expiresAt: Date;
    discordMessageId?: string;
    telegramMessageId?: string;
  }): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query(
        `INSERT INTO reset_leaderboard_codes (user_id, discord_code, telegram_code, email_code, user_email, username, expires_at, discord_message_id, telegram_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           discord_code = EXCLUDED.discord_code,
           telegram_code = EXCLUDED.telegram_code,
           email_code = EXCLUDED.email_code,
           user_email = EXCLUDED.user_email,
           username = EXCLUDED.username,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           is_used = FALSE,
           discord_message_id = EXCLUDED.discord_message_id,
           telegram_message_id = EXCLUDED.telegram_message_id,
           updated_at = CURRENT_TIMESTAMP`,
        [
          data.userId,
          data.discordCode,
          data.telegramCode,
          data.emailCode,
          data.userEmail || null,
          data.username,
          data.expiresAt,
          data.discordMessageId || null,
          data.telegramMessageId || null
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get reset leaderboard code for a user
   */
  async getResetLeaderboardCode(userId: string): Promise<{
    discordCode: string;
    telegramCode: string;
    emailCode: string;
    userEmail?: string;
    username: string;
    expiresAt: Date;
    attempts: number;
    isUsed: boolean;
    discordMessageId?: string;
    telegramMessageId?: string;
  } | null> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM reset_leaderboard_codes WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        discordCode: row.discord_code,
        telegramCode: row.telegram_code,
        emailCode: row.email_code,
        userEmail: row.user_email,
        username: row.username,
        expiresAt: row.expires_at,
        attempts: row.attempts,
        isUsed: row.is_used,
        discordMessageId: row.discord_message_id,
        telegramMessageId: row.telegram_message_id
      };
    } finally {
      client.release();
    }
  }

  /**
   * Increment attempts for reset leaderboard code
   */
  async incrementResetLeaderboardCodeAttempts(userId: string): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query(
        'UPDATE reset_leaderboard_codes SET attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
        [userId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Mark reset leaderboard code as used
   */
  async markResetLeaderboardCodeAsUsed(userId: string): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query(
        'UPDATE reset_leaderboard_codes SET is_used = TRUE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
        [userId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Delete reset leaderboard code
   */
  async deleteResetLeaderboardCode(userId: string): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query('DELETE FROM reset_leaderboard_codes WHERE user_id = $1', [userId]);
    } finally {
      client.release();
    }
  }

  /**
   * Store reset leaderboard access grant
   */
  async storeResetLeaderboardAccess(data: {
    userId: string;
    expiresAt: Date;
  }): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query(
        `INSERT INTO reset_leaderboard_access (user_id, expires_at)
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           granted_at = CURRENT_TIMESTAMP,
           expires_at = EXCLUDED.expires_at`,
        [data.userId, data.expiresAt]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get reset leaderboard access for a user
   */
  async getResetLeaderboardAccess(userId: string): Promise<{
    grantedAt: Date;
    expiresAt: Date;
  } | null> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM reset_leaderboard_access WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        grantedAt: row.granted_at,
        expiresAt: row.expires_at
      };
    } finally {
      client.release();
    }
  }

  /**
   * Delete reset leaderboard access
   */
  async deleteResetLeaderboardAccess(userId: string): Promise<void> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      await client.query('DELETE FROM reset_leaderboard_access WHERE user_id = $1', [userId]);
    } finally {
      client.release();
    }
  }

  /**
   * Clean up expired codes and access (should be run periodically)
   */
  async cleanupExpiredVPSCodes(): Promise<number> {
    if (!this.postgresPool) throw new Error('Database not connected');

    const client = await this.postgresPool.connect();
    try {
      const result1 = await client.query(
        'DELETE FROM vps_codes WHERE expires_at < NOW() AND is_used = TRUE'
      );
      const result2 = await client.query(
        'DELETE FROM vps_access WHERE expires_at < NOW()'
      );
      const result3 = await client.query(
        'DELETE FROM reset_leaderboard_codes WHERE expires_at < NOW() AND is_used = TRUE'
      );
      const result4 = await client.query(
        'DELETE FROM reset_leaderboard_access WHERE expires_at < NOW()'
      );

      return (result1.rowCount || 0) + (result2.rowCount || 0) + (result3.rowCount || 0) + (result4.rowCount || 0);
    } finally {
      client.release();
    }
  }
}