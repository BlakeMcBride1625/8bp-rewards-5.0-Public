const { Pool } = require('pg');
require('dotenv').config();

class DatabaseService {
  constructor() {
    this.isConnected = false;
    this.pool = null;
    this.isPostgresMode = process.env.DATABASE_TYPE === 'postgresql';
  }

  static getInstance() {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log('📊 Database already connected');
        return true;
      }

      if (this.isPostgresMode) {
        console.log('🔗 Connecting to PostgreSQL...');
        
        this.pool = new Pool({
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || '8bp_rewards',
          user: process.env.POSTGRES_USER || 'admin',
          password: process.env.POSTGRES_PASSWORD || '',
          ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
        });

        // Test connection
        const client = await this.pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        this.isConnected = true;
        console.log('✅ Connected to PostgreSQL');
        return true;
      } else {
        console.log('⚠️ MongoDB mode not supported in this JavaScript version');
        return false;
      }
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }
      this.isConnected = false;
      console.log('🔌 Disconnected from PostgreSQL');
    } catch (error) {
      console.error('❌ Error disconnecting from database:', error.message);
    }
  }

  async createClaimRecord(data) {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO claim_records (id, eight_ball_pool_id, website_user_id, status, items_claimed, error_message, claimed_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      
      const values = [
        require('crypto').randomUUID(),
        data.eightBallPoolId,
        data.websiteUserId,
        data.status,
        data.itemsClaimed || [], // Pass as array directly
        data.error || null,
        data.claimedAt || new Date(),
        JSON.stringify(data.metadata || {})
      ];
      
      const result = await client.query(sql, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async findClaimRecords(filter = {}) {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    try {
      let sql = 'SELECT * FROM claim_records';
      const params = [];
      let paramCount = 0;

      if (filter.eightBallPoolId) {
        paramCount++;
        sql += ` WHERE eight_ball_pool_id = $${paramCount}`;
        params.push(filter.eightBallPoolId);
      }

      if (filter.status) {
        paramCount++;
        sql += paramCount === 1 ? ' WHERE' : ' AND';
        sql += ` status = $${paramCount}`;
        params.push(filter.status);
      }

      if (filter.claimedAt && filter.claimedAt.$gte) {
        paramCount++;
        sql += paramCount === 1 ? ' WHERE' : ' AND';
        sql += ` claimed_at >= $${paramCount}`;
        params.push(filter.claimedAt.$gte);
      }

      if (filter.claimedAt && filter.claimedAt.$lte) {
        paramCount++;
        sql += paramCount === 1 ? ' WHERE' : ' AND';
        sql += ` claimed_at <= $${paramCount}`;
        params.push(filter.claimedAt.$lte);
      }

      sql += ' ORDER BY claimed_at DESC';

      const result = await client.query(sql, params);
      return result.rows.map(row => ({
        id: row.id,
        eightBallPoolId: row.eight_ball_pool_id,
        websiteUserId: row.website_user_id,
        status: row.status,
        itemsClaimed: Array.isArray(row.items_claimed) ? row.items_claimed : JSON.parse(row.items_claimed || '[]'),
        error: row.error_message,
        claimedAt: row.claimed_at,
        metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
      }));
    } finally {
      client.release();
    }
  }

  async cleanupFailedClaims() {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
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
        console.warn('⚠️ Validation logs cleanup skipped:', validationError.message || validationError);
      }

      await client.query('COMMIT');

      console.log('🧹 Failed claims cleanup complete', {
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
      console.error('❌ Failed to cleanup failed claims:', error.message || error);
      throw error;
    } finally {
      client.release();
    }
  }

  async findRegistrations(filter = {}) {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    try {
      let sql = 'SELECT * FROM registrations';
      const params = [];
      let paramCount = 0;

      if (filter.eightBallPoolId) {
        paramCount++;
        sql += ` WHERE eight_ball_pool_id = $${paramCount}`;
        params.push(filter.eightBallPoolId);
      }

      if (filter.createdAt && filter.createdAt.$gte) {
        paramCount++;
        sql += paramCount === 1 ? ' WHERE' : ' AND';
        sql += ` created_at >= $${paramCount}`;
        params.push(filter.createdAt.$gte);
      }

      sql += ' ORDER BY created_at DESC';

      const result = await client.query(sql, params);
      return result.rows.map(row => ({
        id: row.id,
        eightBallPoolId: row.eight_ball_pool_id,
        username: row.username,
        password: row.password,
        discordId: row.discord_id,
        telegramId: row.telegram_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: row.is_active,
        isBlocked: row.is_blocked,
        blockedReason: row.blocked_reason,
        metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
      }));
    } finally {
      client.release();
    }
  }

  async getAllUsers() {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    try {
      const sql = 'SELECT * FROM registrations ORDER BY created_at DESC';
      const result = await client.query(sql);
      return result.rows.map(row => ({
        id: row.id,
        eightBallPoolId: row.eight_ball_pool_id,
        username: row.username,
        password: row.password,
        discordId: row.discord_id,
        telegramId: row.telegram_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: row.is_active,
        isBlocked: row.is_blocked,
        blockedReason: row.blocked_reason,
        metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
      }));
    } finally {
      client.release();
    }
  }

  async addOrUpdateUser(eightBallPoolId, username) {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    try {
      // Check if user already exists
      const existingUser = await client.query(
        'SELECT * FROM registrations WHERE eight_ball_pool_id = $1',
        [eightBallPoolId]
      );

      if (existingUser.rows.length > 0) {
        // Update existing user
        await client.query(
          'UPDATE registrations SET username = $2, updated_at = CURRENT_TIMESTAMP WHERE eight_ball_pool_id = $1',
          [eightBallPoolId, username]
        );
        return { success: true, isNew: false };
      } else {
        // Create new user
        await client.query(
          'INSERT INTO registrations (id, eight_ball_pool_id, username, created_at, updated_at, is_active) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)',
          [require('crypto').randomUUID(), eightBallPoolId, username]
        );
        return { success: true, isNew: true };
      }
    } finally {
      client.release();
    }
  }

  async getUserCount() {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT COUNT(*) FROM registrations');
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  async removeUserByEightBallPoolId(eightBallPoolId) {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM registrations WHERE eight_ball_pool_id = $1',
        [eightBallPoolId]
      );
      
      if (result.rowCount > 0) {
        return { success: true };
      } else {
        return { success: false, error: 'User not found' };
      }
    } finally {
      client.release();
    }
  }

  // Validation and deregistration methods
  
  /**
   * Create invalid user record
   */
  async createInvalidUserRecord(invalidUserData) {
    if (!this.isConnected) {
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
      
      const result = await this.pool.query(query, values);
      console.log(`📝 Invalid user record created: ${invalidUserData.eightBallPoolId}`);
      return result.rows[0];
      
    } catch (error) {
      console.error('❌ Failed to create invalid user record:', error);
      throw error;
    }
  }

  /**
   * Get all invalid users
   */
  async findInvalidUsers() {
    if (!this.isConnected) {
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
      
      const result = await this.pool.query(query);
      return result.rows;
      
    } catch (error) {
      console.error('❌ Failed to fetch invalid users:', error);
      throw error;
    }
  }

  /**
   * Update invalid user record
   */
  async updateInvalidUser(eightBallPoolId, updates) {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
      const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
      const query = `UPDATE invalid_users SET ${setClause} WHERE eight_ball_pool_id = $1 RETURNING *`;
      const values = [eightBallPoolId, ...Object.values(updates)];
      
      const result = await this.pool.query(query, values);
      console.log(`📝 Updated invalid user record: ${eightBallPoolId}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Failed to update invalid user:', error.message);
      throw error;
    }
  }

  /**
   * Create validation log entry
   */
  async createValidationLog(logData) {
    if (!this.isConnected) {
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
      
      const result = await this.pool.query(query, values);
      return result.rows[0];
      
    } catch (error) {
      console.error('❌ Failed to create validation log:', error);
      throw error;
    }
  }

  /**
   * Get validation logs with filtering
   */
  async getValidationLogs(filters = {}) {
    if (!this.isConnected) {
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
      
      const values = [];
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
      
      const result = await this.pool.query(query, values);
      return result.rows;
      
    } catch (error) {
      console.error('❌ Failed to fetch validation logs:', error);
      throw error;
    }
  }

  /**
   * Get system health metrics
   */
  async getSystemHealthMetrics() {
    if (!this.isConnected) {
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
      
      const results = {};
      
      for (const [key, query] of Object.entries(queries)) {
        try {
          const result = await this.pool.query(query);
          if (key === 'moduleStats') {
            results[key] = result.rows;
          } else {
            results[key] = parseInt(result.rows[0].count);
          }
        } catch (error) {
          console.error(`❌ Failed to fetch ${key}:`, error);
          results[key] = null;
        }
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ Failed to fetch system health metrics:', error);
      throw error;
    }
  }

  /**
   * Cleanup old validation logs
   */
  async cleanupValidationLogs(daysToKeep = 30) {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
      const query = `
        DELETE FROM validation_logs 
        WHERE timestamp < NOW() - INTERVAL '${daysToKeep} days'
      `;
      
      const result = await this.pool.query(query);
      console.log(`🧹 Cleaned up ${result.rowCount} old validation logs`);
      return result.rowCount;
      
    } catch (error) {
      console.error('❌ Failed to cleanup validation logs:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      if (!this.isConnected || !this.pool) {
        return { connected: false, userCount: 0, timestamp: new Date().toISOString() };
      }

      const client = await this.pool.connect();
      try {
        const result = await client.query('SELECT COUNT(*) FROM registrations');
        const userCount = parseInt(result.rows[0].count);
        return {
          connected: this.isConnected,
          userCount,
          timestamp: new Date().toISOString()
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        connected: false,
        userCount: 0,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = DatabaseService;